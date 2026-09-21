import { Injectable } from "@nestjs/common";
import {
  DialogueGenerationResultSchema,
  SpeechSynthesisStreamEventSchema,
  TtsSynthesisRequestSchema,
  type DialogueGenerationResult,
  type SpeechSynthesisStreamEvent,
  type VoicePipelineRequest,
} from "@/contracts";
import { DialogueGenerationService } from "@/modules/dialogue-generation";
import { SpeechSynthesisService } from "@/modules/speech-synthesis";
import { ScenarioAudioService } from "@/modules/scenario-audio/scenario-audio.service";
import {
  abortable,
  isGroundedOfflineReply,
  requestsInstructionOverride,
} from "../domain/offline-turn";
import { VoiceRuntimeService } from "./voice-runtime.service";
import { canUsePreparedReply } from "../domain/prepared-reply";
import { assertCallerReplyContent } from "@/modules/dialogue-generation/domain/caller-reply-content";

type Reason = NonNullable<DialogueGenerationResult["resolution"]>["reason"];

@Injectable()
export class OfflineReplyService {
  constructor(
    readonly runtime: VoiceRuntimeService,
    private readonly generation: DialogueGenerationService,
    private readonly synthesis: SpeechSynthesisService,
    private readonly audio: ScenarioAudioService,
  ) {}

  async resolve(
    request: VoicePipelineRequest,
    parent: AbortSignal,
  ): Promise<{
    result: DialogueGenerationResult;
    stream: AsyncIterable<SpeechSynthesisStreamEvent>;
  }> {
    parent.throwIfAborted();
    const deadlineAt =
      request.exceptionDeadlineAt ??
      performance.now() + this.runtime.settings.budgetMs;
    const deadline = AbortSignal.any([
      parent,
      AbortSignal.timeout(
        Math.max(1, Math.ceil(deadlineAt - performance.now())),
      ),
    ]);
    const tts = (text: string) =>
      TtsSynthesisRequestSchema.parse({
        requestId: request.generation.requestId,
        sessionId: request.generation.sessionId,
        text,
        language: request.generation.context.persona.language,
        ...request.voice,
      });
    let reason: Reason = request.exceptionReason;
    if (performance.now() >= deadlineAt) reason = "deadline";
    let result: DialogueGenerationResult | undefined;
    if (requestsInstructionOverride(request.generation.operatorText))
      reason = "prompt-injection";
    try {
      if (!reason) {
        const fallback = request.generation.fallbackReply;
        if (fallback && canUsePreparedReply(request)) {
          const lookupStartedAt = performance.now();
          const recorded = await abortable(
            this.audio.lookup(
              request.generation.scenarioVersionId,
              tts(fallback.text),
              deadline,
            ),
            deadline,
          );
          if (recorded) {
            const resolution = {
              profile: "offline-hybrid",
              path: "prepared",
            } as const;
            this.runtime.record(resolution.path);
            return {
              result: {
                reply: fallback,
                source: "prepared",
                attempts: [],
                resolution,
              },
              stream: this.audio.replay(
                recorded,
                request.generation.requestId,
                parent,
                performance.now() - lookupStartedAt,
              ),
            };
          }
          result = { reply: fallback, source: "prepared", attempts: [] };
        }
        if (!result && !request.generation.context.allowedFacts.length) {
          reason = "unavailable-fact";
          throw new Error("No permitted facts or prepared reaction");
        }
        result ??= DialogueGenerationResultSchema.parse(
          await abortable(
            this.generation.generate(request.generation, deadline),
            deadline,
          ),
        );
        if (result.source === "fallback") reason = "generation-failed";
        else if (!isGroundedOfflineReply(result.reply, request.generation))
          reason = "ungrounded-response";
        else {
          assertCallerReplyContent(result.reply, request.generation);
          // Commit text only after the entire limited audio stream has succeeded.
          reason = "synthesis-failed";
          const events = await this.buffer(
            this.synthesis.synthesize(tts(result.reply.text), deadline),
            request.generation.requestId,
            deadline,
          );
          parent.throwIfAborted();
          result.resolution = {
            profile: "offline-hybrid",
            path: "local-generated",
          };
          this.runtime.record(result.resolution.path);
          return {
            result,
            stream: (async function* () {
              for (const event of events) {
                parent.throwIfAborted();
                yield event;
              }
            })(),
          };
        }
      }
    } catch {
      parent.throwIfAborted();
      reason = deadline.aborted ? "deadline" : (reason ?? "generation-failed");
    }
    parent.throwIfAborted();
    // A separate bounded storage budget is allowed after inference's deadline.
    const storageSignal = AbortSignal.any([parent, AbortSignal.timeout(1_000)]);
    const fallbackLookupAt = performance.now();
    const safe = await abortable(
      this.audio.safeFallback(
        request.generation.scenarioVersionId,
        tts(request.generation.fallbackReply?.text ?? "Алло?"),
        storageSignal,
      ),
      storageSignal,
    );
    parent.throwIfAborted();
    if (!safe)
      throw new Error(
        "Offline safe audio is unavailable; prepare the scenario before calling",
      );
    const resolution = {
      profile: "offline-hybrid",
      path: "safe-fallback",
      reason: reason ?? "generation-failed",
    } as const;
    // Corrupted authored audio must fail closed, never announce an instruction.
    assertCallerReplyContent({
      text: safe.text,
      emotion: request.voice.emotion,
      intensity: request.voice.intensity,
      speechRate: request.voice.speechRate,
      revealedFactIds: [],
      endCall: false,
    });
    this.runtime.record(resolution.reason);
    return {
      result: DialogueGenerationResultSchema.parse({
        reply: {
          text: safe.text,
          emotion: request.voice.emotion,
          intensity: request.voice.intensity,
          speechRate: request.voice.speechRate,
          revealedFactIds: [],
          endCall: false,
        },
        source: result?.attempts.length ? "fallback" : "prepared",
        attempts: result?.attempts ?? [],
        resolution,
      }),
      stream: this.audio.replay(
        safe,
        request.generation.requestId,
        parent,
        performance.now() - fallbackLookupAt,
      ),
    };
  }

  private async buffer(
    stream: AsyncIterable<SpeechSynthesisStreamEvent>,
    requestId: string,
    signal: AbortSignal,
  ): Promise<SpeechSynthesisStreamEvent[]> {
    const iterator = stream[Symbol.asyncIterator]();
    const events: SpeechSynthesisStreamEvent[] = [];
    let bytes = 0;
    let count = 0;
    let sampleRate: number | undefined;
    let final = false;
    let completed = false;
    try {
      while (true) {
        const next = await abortable(iterator.next(), signal);
        if (next.done) break;
        const event = SpeechSynthesisStreamEventSchema.parse(next.value);
        if (completed) throw new Error("Audio after completion");
        if (event.type === "audio.chunk") {
          if (
            final ||
            event.chunk.streamId !== requestId ||
            event.chunk.sequence !== count ||
            (sampleRate !== undefined && sampleRate !== event.chunk.sampleRate)
          )
            throw new Error("Invalid audio sequence");
          sampleRate = event.chunk.sampleRate;
          final = event.chunk.isFinal;
          bytes += event.chunk.audio.byteLength;
          count++;
          if (bytes > 8 * 1024 * 1024 || count > 10_000)
            throw new Error("Offline audio buffer exceeded");
        } else {
          if (
            !final ||
            count !== event.metrics.chunkCount ||
            bytes !== event.metrics.audioBytes
          )
            throw new Error("Incomplete audio");
          completed = true;
        }
        events.push(event);
      }
      if (!completed) throw new Error("Missing audio completion");
      return events;
    } finally {
      // Do not await an uncooperative provider after the deadline.
      void iterator.return?.().catch(() => undefined);
    }
  }
}
