import { Injectable, Optional } from "@nestjs/common";

import {
  DialogueGenerationResultSchema,
  PrescribedSpeechRequestSchema,
  SpeechSynthesisStreamEventSchema,
  TtsSynthesisRequestSchema,
  VoicePipelineMetricsSchema,
  VoicePipelineRequestSchema,
  VoicePipelineStreamEventSchema,
  type DialogueGenerationResult,
  type PrescribedSpeechRequest,
  type SpeechSynthesisMetrics,
  type SpeechSynthesisStreamEvent,
  type TtsSynthesisRequest,
  type VoicePipelineMetrics,
  type VoicePipelineRequest,
  type VoicePipelineStreamEvent,
} from "@/contracts";
import { DialogueGenerationService } from "@/modules/dialogue-generation";
import { SpeechSynthesisService } from "@/modules/speech-synthesis";
import { ScenarioAudioService } from "@/modules/scenario-audio/scenario-audio.service";
import { OfflineReplyService } from "./offline-reply.service";
import { assertCallerReplyContent } from "@/modules/dialogue-generation/domain/caller-reply-content";
import { canUsePreparedReply } from "../domain/prepared-reply";

import {
  VoicePipelineError,
  type VoicePipelineErrorCode,
  type VoicePipelineFailureMetrics,
} from "../domain/voice-pipeline.error";

export const remainingResponseDelayMs = (
  minimumResponseDelayMs: number,
  elapsedMs: number,
): number => Math.max(0, minimumResponseDelayMs - elapsedMs);

const waitForDelay = (delayMs: number, signal: AbortSignal): Promise<void> => {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }

  if (delayMs <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal.reason);
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);

    signal.addEventListener("abort", onAbort, { once: true });
  });
};

@Injectable()
export class VoicePipelineService {
  constructor(
    private readonly dialogueGeneration: DialogueGenerationService,
    private readonly speechSynthesis: SpeechSynthesisService,
    @Optional() private readonly preparedAudio?: ScenarioAudioService,
    @Optional() private readonly offline?: OfflineReplyService,
  ) {}

  async assertCanStart(versionId: string): Promise<void> {
    if (this.offline?.runtime.settings.enabled)
      await this.preparedAudio?.assertOfflineReady(versionId);
  }

  streamReply(
    input: unknown,
    signal: AbortSignal,
    elapsedBeforePipelineMs = 0,
  ): AsyncIterable<VoicePipelineStreamEvent> {
    const request = VoicePipelineRequestSchema.parse(input);
    signal.throwIfAborted();

    return this.streamValidatedReply(
      request,
      signal,
      Math.max(0, elapsedBeforePipelineMs),
    );
  }

  streamPrescribedSpeech(
    input: unknown,
    signal: AbortSignal,
  ): AsyncIterable<SpeechSynthesisStreamEvent> {
    const request = PrescribedSpeechRequestSchema.parse(input);
    signal.throwIfAborted();

    return this.streamValidatedPrescribedSpeech(request, signal);
  }

  private async *streamValidatedPrescribedSpeech(
    request: PrescribedSpeechRequest,
    signal: AbortSignal,
  ): AsyncIterable<SpeechSynthesisStreamEvent> {
    await waitForDelay(request.minimumResponseDelayMs, signal);
    signal.throwIfAborted();

    const synthesisRequest = TtsSynthesisRequestSchema.parse({
      requestId: request.requestId,
      sessionId: request.sessionId,
      text: request.text,
      language: request.language,
      ...request.voice,
    });
    const lookupStartedAt = performance.now();
    const prepared = await this.preparedAudio?.lookupOpening(
      request.sessionId,
      synthesisRequest,
      signal,
    );
    const lookupMs = performance.now() - lookupStartedAt;
    if (this.offline?.runtime.settings.enabled && !prepared)
      throw new Error("Offline opening audio is unavailable");
    yield* prepared && this.preparedAudio
      ? this.preparedAudio.replay(prepared, request.requestId, signal, lookupMs)
      : this.speechSynthesis.synthesize(synthesisRequest, signal);
  }

  private async *streamValidatedReply(
    request: VoicePipelineRequest,
    signal: AbortSignal,
    elapsedBeforePipelineMs: number,
  ): AsyncIterable<VoicePipelineStreamEvent> {
    const startedAt = performance.now();
    let generationResult: DialogueGenerationResult;
    let prepared: Awaited<ReturnType<ScenarioAudioService["lookup"]>> = null;
    // Поиск записи тоже занимает время, и он обязан попасть в метрику
    // задержки: иначе заготовленный ответ выглядит мгновенным.
    let preparedLookupMs = 0;
    let bufferedStream: AsyncIterable<SpeechSynthesisStreamEvent> | undefined;

    try {
      if (this.offline?.runtime.settings.enabled) {
        const resolved = await this.offline.resolve(request, signal);
        generationResult = resolved.result;
        bufferedStream = resolved.stream;
      } else {
        const fallback = request.generation.fallbackReply;
        // Заготовка движка в caller-v2 подменила бы ответ дообученного
        // заявителя, ради которого этот режим и включают.
        if (
          request.generation.replyProtocol !== "caller-v2" &&
          fallback &&
          canUsePreparedReply(request)
        ) {
          const candidate: DialogueGenerationResult = {
            reply: fallback,
            source: "prepared",
            attempts: [],
          };
          const candidateLookupAt = performance.now();
          prepared =
            (await this.preparedAudio?.lookup(
              request.generation.scenarioVersionId,
              this.createSynthesisRequest(request, candidate),
              signal,
            )) ?? null;
          preparedLookupMs += performance.now() - candidateLookupAt;
          // Missing audio requires synthesis, not a new version of approved text.
          generationResult = candidate;
        } else {
          generationResult = await this.dialogueGeneration.generate(
            request.generation,
            signal,
          );
        }
        generationResult =
          DialogueGenerationResultSchema.parse(generationResult);
        assertCallerReplyContent(
          generationResult.reply,
          generationResult.source === "model" ? request.generation : undefined,
        );
        // A model/fallback may return an already approved phrase too. Reuse its
        // audio without erasing the real generation attempts from the metrics.
        if (
          !prepared &&
          this.preparedAudio &&
          generationResult.source !== "prepared"
        ) {
          const replyLookupAt = performance.now();
          prepared = await this.preparedAudio.lookup(
            request.generation.scenarioVersionId,
            this.createSynthesisRequest(request, generationResult),
            signal,
          );
          preparedLookupMs += performance.now() - replyLookupAt;
        }
      }
    } catch {
      if (signal.aborted) {
        signal.throwIfAborted();
      }

      throw this.createError("generation-failed", startedAt);
    }

    const replyReadyAt = performance.now();
    const timeToReplyMs = replyReadyAt - startedAt;

    yield VoicePipelineStreamEventSchema.parse({
      type: "voice.reply.ready",
      result: generationResult,
      timeToReplyMs,
    });

    const turnPlan = request.generation.context.turnPlan;
    const plannedDelayMs = turnPlan?.minimumResponseDelayMs ?? 0;
    const delayMs = remainingResponseDelayMs(
      plannedDelayMs,
      elapsedBeforePipelineMs + performance.now() - startedAt,
    );
    const delayStartedAt = performance.now();
    await waitForDelay(delayMs, signal);
    const appliedDelayMs = performance.now() - delayStartedAt;

    const synthesisRequest = this.createSynthesisRequest(
      request,
      generationResult,
    );
    let synthesisMetrics: SpeechSynthesisMetrics | null = null;
    let firstAudioAt: number | null = null;
    let audioChunkCount = 0;
    let audioBytes = 0;

    try {
      const synthesisStream =
        bufferedStream ??
        (prepared && this.preparedAudio
          ? this.preparedAudio.replay(
              prepared,
              synthesisRequest.requestId,
              signal,
              preparedLookupMs,
            )
          : this.speechSynthesis.synthesize(synthesisRequest, signal));

      for await (const rawEvent of synthesisStream) {
        signal.throwIfAborted();

        if (synthesisMetrics !== null) {
          throw this.createError(
            "protocol-error",
            startedAt,
            replyReadyAt,
            firstAudioAt,
            audioChunkCount,
            audioBytes,
          );
        }

        const parsedEvent =
          SpeechSynthesisStreamEventSchema.safeParse(rawEvent);

        if (!parsedEvent.success) {
          throw this.createError(
            "protocol-error",
            startedAt,
            replyReadyAt,
            firstAudioAt,
            audioChunkCount,
            audioBytes,
          );
        }

        const event = parsedEvent.data;

        if (event.type === "synthesis.completed") {
          synthesisMetrics = event.metrics;
          continue;
        }

        if (event.chunk.streamId !== request.generation.requestId) {
          throw this.createError(
            "protocol-error",
            startedAt,
            replyReadyAt,
            firstAudioAt,
            audioChunkCount,
            audioBytes,
          );
        }

        firstAudioAt ??= performance.now();
        audioChunkCount += 1;
        audioBytes += event.chunk.audio.byteLength;

        yield VoicePipelineStreamEventSchema.parse({
          type: "voice.audio.chunk",
          chunk: event.chunk,
        });
      }
    } catch (error) {
      if (signal.aborted) {
        signal.throwIfAborted();
      }

      if (error instanceof VoicePipelineError) {
        throw error;
      }

      throw this.createError(
        "synthesis-failed",
        startedAt,
        replyReadyAt,
        firstAudioAt,
        audioChunkCount,
        audioBytes,
      );
    }

    if (
      synthesisMetrics === null ||
      firstAudioAt === null ||
      synthesisMetrics.chunkCount !== audioChunkCount ||
      synthesisMetrics.audioBytes !== audioBytes
    ) {
      throw this.createError(
        "protocol-error",
        startedAt,
        replyReadyAt,
        firstAudioAt,
        audioChunkCount,
        audioBytes,
      );
    }

    const finishedAt = performance.now();
    let metrics: VoicePipelineMetrics;

    try {
      metrics = VoicePipelineMetricsSchema.parse({
        timeToReplyMs,
        timeToFirstAudioMs: firstAudioAt - startedAt,
        durationMs: finishedAt - startedAt,
        generation: {
          source: generationResult.source,
          attempts: generationResult.attempts,
          ...(generationResult.resolution
            ? { resolution: generationResult.resolution }
            : {}),
        },
        synthesis: synthesisMetrics,
        ...(turnPlan === undefined
          ? {}
          : {
              turnTaking: {
                reactionAct: turnPlan.reactionAct,
                minimumResponseDelayMs: plannedDelayMs,
                elapsedBeforePipelineMs,
                appliedDelayMs,
              },
            }),
      });
    } catch {
      throw this.createError(
        "protocol-error",
        startedAt,
        replyReadyAt,
        firstAudioAt,
        audioChunkCount,
        audioBytes,
      );
    }

    yield VoicePipelineStreamEventSchema.parse({
      type: "voice.completed",
      metrics,
    });
  }

  /**
   * Слова берутся у модели, базовое звучание — у сценария. В caller-v2 модель
   * дополнительно выбирает эмоцию из закрытого списка.
   *
   * Раньше силу и темп речи задавала модель, и ступень паники до голоса не
   * доходила вовсе: заявитель на четвёртой ступени мог говорить размеренно, а
   * про горящую квартиру — с интонацией диктора.
   */
  private createSynthesisRequest(
    request: VoicePipelineRequest,
    generationResult: DialogueGenerationResult,
  ): TtsSynthesisRequest {
    return TtsSynthesisRequestSchema.parse({
      requestId: request.generation.requestId,
      sessionId: request.generation.sessionId,
      text: generationResult.reply.text,
      language: request.generation.context.persona.language,
      ...request.voice,
      // В caller-v2 эмоциональную окраску выбирает дообученный заявитель.
      ...(request.generation.replyProtocol === "caller-v2"
        ? { emotion: generationResult.reply.emotion }
        : {}),
    });
  }

  private createError(
    code: VoicePipelineErrorCode,
    startedAt: number,
    replyReadyAt: number | null = null,
    firstAudioAt: number | null = null,
    audioChunkCount = 0,
    audioBytes = 0,
  ): VoicePipelineError {
    const metrics: VoicePipelineFailureMetrics = {
      durationMs: performance.now() - startedAt,
      timeToReplyMs: replyReadyAt === null ? null : replyReadyAt - startedAt,
      timeToFirstAudioMs:
        firstAudioAt === null ? null : firstAudioAt - startedAt,
      audioChunkCount,
      audioBytes,
    };

    return new VoicePipelineError(code, metrics);
  }
}
