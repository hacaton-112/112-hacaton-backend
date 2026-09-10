import { Injectable } from "@nestjs/common";

import {
  DialogueGenerationResultSchema,
  SpeechSynthesisStreamEventSchema,
  TtsSynthesisRequestSchema,
  VoicePipelineMetricsSchema,
  VoicePipelineRequestSchema,
  VoicePipelineStreamEventSchema,
  type DialogueGenerationResult,
  type SpeechSynthesisMetrics,
  type TtsSynthesisRequest,
  type VoicePipelineMetrics,
  type VoicePipelineRequest,
  type VoicePipelineStreamEvent,
} from "@/contracts";
import { DialogueGenerationService } from "@/modules/dialogue-generation";
import { SpeechSynthesisService } from "@/modules/speech-synthesis";

import {
  VoicePipelineError,
  type VoicePipelineErrorCode,
  type VoicePipelineFailureMetrics,
} from "../domain/voice-pipeline.error";

@Injectable()
export class VoicePipelineService {
  constructor(
    private readonly dialogueGeneration: DialogueGenerationService,
    private readonly speechSynthesis: SpeechSynthesisService,
  ) {}

  streamReply(
    input: unknown,
    signal: AbortSignal,
  ): AsyncIterable<VoicePipelineStreamEvent> {
    const request = VoicePipelineRequestSchema.parse(input);
    signal.throwIfAborted();

    return this.streamValidatedReply(request, signal);
  }

  private async *streamValidatedReply(
    request: VoicePipelineRequest,
    signal: AbortSignal,
  ): AsyncIterable<VoicePipelineStreamEvent> {
    const startedAt = performance.now();
    let generationResult: DialogueGenerationResult;

    try {
      generationResult = DialogueGenerationResultSchema.parse(
        await this.dialogueGeneration.generate(request.generation, signal),
      );
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

    const synthesisRequest = this.createSynthesisRequest(
      request,
      generationResult,
    );
    let synthesisMetrics: SpeechSynthesisMetrics | null = null;
    let firstAudioAt: number | null = null;
    let audioChunkCount = 0;
    let audioBytes = 0;

    try {
      const synthesisStream = this.speechSynthesis.synthesize(
        synthesisRequest,
        signal,
      );

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
        },
        synthesis: synthesisMetrics,
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
   * Слова берутся у модели, звучание — у сценария.
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
