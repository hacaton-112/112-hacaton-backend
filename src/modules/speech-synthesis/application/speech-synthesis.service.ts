import { Inject, Injectable } from "@nestjs/common";

import {
  SpeechSynthesisStreamEventSchema,
  TtsSynthesisRequestSchema,
  type SpeechSynthesisAttemptMetrics,
  type SpeechSynthesisStreamEvent,
  type TtsSynthesisRequest,
} from "@/contracts";
import { TTS_PORT } from "@/modules/ai-gateway/ai-gateway.tokens";
import type { TtsPort } from "@/modules/ai-gateway/ports/tts.port";

import { SpeechSynthesisError } from "../domain/speech-synthesis.error";
import { TtsStreamValidationError } from "../domain/tts-stream-validation.error";
import { TtsStreamValidator } from "./tts-stream.validator";

export const MAX_SPEECH_SYNTHESIS_ATTEMPTS = 2;

@Injectable()
export class SpeechSynthesisService {
  constructor(
    @Inject(TTS_PORT)
    private readonly ttsPort: TtsPort,
    private readonly streamValidator: TtsStreamValidator,
  ) {}

  synthesize(
    input: unknown,
    signal: AbortSignal,
  ): AsyncIterable<SpeechSynthesisStreamEvent> {
    const request = TtsSynthesisRequestSchema.parse(input);
    signal.throwIfAborted();

    return this.synthesizeValidated(request, signal);
  }

  private async *synthesizeValidated(
    request: TtsSynthesisRequest,
    signal: AbortSignal,
  ): AsyncIterable<SpeechSynthesisStreamEvent> {
    const startedAt = performance.now();
    const attempts: SpeechSynthesisAttemptMetrics[] = [];
    let firstAudioAt: number | null = null;
    let chunkCount = 0;
    let audioBytes = 0;

    for (
      let attempt = 1;
      attempt <= MAX_SPEECH_SYNTHESIS_ATTEMPTS;
      attempt += 1
    ) {
      const attemptStartedAt = performance.now();
      let emittedAudio = false;

      try {
        const providerStream = this.ttsPort.synthesize(request, signal);

        for await (const chunk of this.streamValidator.validate(
          providerStream,
          signal,
        )) {
          signal.throwIfAborted();
          firstAudioAt ??= performance.now();
          emittedAudio = true;
          chunkCount += 1;
          audioBytes += chunk.audio.byteLength;

          yield SpeechSynthesisStreamEventSchema.parse({
            type: "audio.chunk",
            chunk,
          });
        }

        attempts.push({
          attempt,
          durationMs: performance.now() - attemptStartedAt,
          outcome: "success",
        });

        const finishedAt = performance.now();

        yield SpeechSynthesisStreamEventSchema.parse({
          type: "synthesis.completed",
          metrics: {
            timeToFirstAudioMs: (firstAudioAt ?? finishedAt) - startedAt,
            durationMs: finishedAt - startedAt,
            chunkCount,
            audioBytes,
            attempts,
          },
        });
        return;
      } catch (error) {
        if (signal.aborted) {
          signal.throwIfAborted();
        }

        const outcome = this.classifyFailure(error);

        attempts.push({
          attempt,
          durationMs: performance.now() - attemptStartedAt,
          outcome,
        });

        if (emittedAudio || attempt === MAX_SPEECH_SYNTHESIS_ATTEMPTS) {
          throw new SpeechSynthesisError(outcome, attempts);
        }
      }
    }
  }

  private classifyFailure(error: unknown): SpeechSynthesisError["code"] {
    return error instanceof TtsStreamValidationError
      ? "invalid-stream"
      : "provider-error";
  }
}
