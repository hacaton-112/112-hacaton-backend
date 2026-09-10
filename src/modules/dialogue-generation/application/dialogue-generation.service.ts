import { Inject, Injectable, Logger } from "@nestjs/common";

import {
  CallerReplySchema,
  DialogueGenerationResultSchema,
  GenerateCallerReplyRequestSchema,
  type CallerReply,
  type DialogueGenerationResult,
  type GenerationAttemptMetrics,
} from "@/contracts";
import { LLM_PORT, type LlmPort } from "@/modules/ai-gateway";

import { CallerReplyValidationError } from "../domain/caller-reply-validation.error";
import { LlmReplyCollectionError } from "../domain/llm-reply-collection.error";
import { LlmReplyStreamCollector } from "./llm-reply-stream.collector";

export const MAX_GENERATION_ATTEMPTS = 2;

const isExplicitlyNonRetryableHttpError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "status" in error &&
  typeof error.status === "number" &&
  error.status >= 400 &&
  error.status < 500 &&
  "retryable" in error &&
  error.retryable === false;

export const DEFAULT_FALLBACK_CALLER_REPLY: CallerReply =
  CallerReplySchema.parse({
    text: "Повторите, пожалуйста, вас плохо слышно.",
    emotion: "anxious",
    intensity: 0.5,
    speechRate: 1,
    revealedFactIds: [],
    endCall: false,
  });

@Injectable()
export class DialogueGenerationService {
  private readonly logger = new Logger(DialogueGenerationService.name);

  constructor(
    @Inject(LLM_PORT)
    private readonly llmPort: LlmPort,
    private readonly streamCollector: LlmReplyStreamCollector,
  ) {}

  async generate(
    input: unknown,
    signal: AbortSignal,
  ): Promise<DialogueGenerationResult> {
    const request = GenerateCallerReplyRequestSchema.parse(input);
    const attempts: GenerationAttemptMetrics[] = [];

    signal.throwIfAborted();

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
      const startedAt = performance.now();

      try {
        const stream = this.llmPort.streamReply(request, signal);
        const collectedReply = await this.streamCollector.collect(
          stream,
          request.context.allowedFacts,
          signal,
        );

        attempts.push({
          attempt,
          timeToFirstTokenMs: collectedReply.timeToFirstTokenMs,
          durationMs: collectedReply.durationMs,
          outcome: "success",
        });

        return DialogueGenerationResultSchema.parse({
          reply: collectedReply.reply,
          source: "model",
          attempts,
        });
      } catch (error) {
        if (signal.aborted) {
          signal.throwIfAborted();
        }

        // Без этой строки отбракованный ответ выглядит как молчание модели:
        // заявитель говорит запасную фразу, а причина не видна нигде.
        this.logger.warn(
          `Rejected a generated caller reply (attempt ${attempt}): ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );

        attempts.push({
          attempt,
          timeToFirstTokenMs: null,
          durationMs: performance.now() - startedAt,
          outcome: this.classifyFailure(error),
        });

        if (isExplicitlyNonRetryableHttpError(error)) {
          break;
        }
      }
    }

    return DialogueGenerationResultSchema.parse({
      reply: DEFAULT_FALLBACK_CALLER_REPLY,
      source: "fallback",
      attempts,
    });
  }

  private classifyFailure(error: unknown): GenerationAttemptMetrics["outcome"] {
    if (
      error instanceof CallerReplyValidationError ||
      error instanceof LlmReplyCollectionError
    ) {
      return "invalid-response";
    }

    return "provider-error";
  }
}
