import { Inject, Injectable, Logger } from "@nestjs/common";

import {
  CallerReplySchema,
  DialogueGenerationResultSchema,
  GenerateCallerReplyRequestSchema,
  type CallerReply,
  type DialogueGenerationResult,
  type GenerateCallerReplyRequest,
  type GenerationAttemptMetrics,
} from "@/contracts";
import { LLM_PORT, type LlmPort } from "@/modules/ai-gateway";

import { CallerReplyValidationError } from "../domain/caller-reply-validation.error";
import {
  assertCallerReplyContent,
  canUseEngineReaction,
} from "../domain/caller-reply-content";
import { LlmReplyCollectionError } from "../domain/llm-reply-collection.error";
import {
  isNearRepetition,
  RECENT_CALLER_REPLIES,
  removeRepeatedSentences,
} from "../domain/repetition";
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
  private readonly retryNearRepetition = true;

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
    let retryFeedback: string | undefined;

    signal.throwIfAborted();

    if (canUseEngineReaction(request)) {
      return DialogueGenerationResultSchema.parse({
        reply: request.fallbackReply,
        source: "prepared",
        attempts: [],
      });
    }

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
      const startedAt = performance.now();

      try {
        const stream = this.llmPort.streamReply(
          retryFeedback === undefined ? request : { ...request, retryFeedback },
          signal,
        );
        const collectedReply = await this.streamCollector.collect(
          stream,
          request.context.allowedFacts,
          signal,
          request,
        );
        // Пересказ предыдущей реплики стоит одной попытки: модель сама себя
        // не слышит, и без этой проверки заявитель по пять ходов подряд
        // говорит «дети в комнате, дверь горит». Проверяется исходный текст:
        // срезанный до одного «Быстрее!» пересказ проверку прошёл бы, а новая
        // попытка с объяснением даёт ответ лучше обрубка.
        if (
          this.retryNearRepetition &&
          attempt < MAX_GENERATION_ATTEMPTS &&
          this.repeatsPreviousReply(request, collectedReply.reply.text)
        ) {
          retryFeedback = `Вариант «${collectedReply.reply.text}» почти дословно повторял прошлую реплику заявителя. Скажи иначе и не пересказывай уже сказанное.`;
          throw new CallerReplyValidationError(
            "repeats-previous",
            "The generated caller reply retells the previous one",
          );
        }

        // Принятый ответ теряет только то, что заявитель уже говорил. На
        // последней попытке пересказ остаётся репликой, но без повторённых
        // фраз: оставить оператора без ответа хуже, чем с коротким ответом.
        const reply = this.withoutRepeatedSentences(
          request,
          collectedReply.reply,
        );
        assertCallerReplyContent(reply, request);

        attempts.push({
          attempt,
          timeToFirstTokenMs: collectedReply.timeToFirstTokenMs,
          durationMs: collectedReply.durationMs,
          outcome: "success",
        });

        return DialogueGenerationResultSchema.parse({
          reply,
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
          `Rejected a generated caller reply request=${request.requestId} (attempt ${attempt}, reason=${error instanceof CallerReplyValidationError ? error.reason : "provider-or-protocol"}): ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );

        attempts.push({
          attempt,
          timeToFirstTokenMs: null,
          durationMs: performance.now() - startedAt,
          outcome: this.classifyFailure(error),
        });

        if (
          isExplicitlyNonRetryableHttpError(error) ||
          (error instanceof CallerReplyValidationError &&
            ["instruction-leak", "operator-echo"].includes(error.reason))
        ) {
          break;
        }
      }
    }

    return DialogueGenerationResultSchema.parse({
      reply: this.safeFallback(request),
      source: "fallback",
      attempts,
    });
  }

  private safeFallback(request: GenerateCallerReplyRequest): CallerReply {
    if (request.fallbackReply) {
      try {
        assertCallerReplyContent(request.fallbackReply, request);
        return request.fallbackReply;
      } catch {
        /* A contaminated scenario must not turn rejection into speech. */
      }
    }
    return {
      ...DEFAULT_FALLBACK_CALLER_REPLY,
      ...(request.fallbackReply
        ? {
            emotion: request.fallbackReply.emotion,
            intensity: request.fallbackReply.intensity,
            speechRate: request.fallbackReply.speechRate,
          }
        : {}),
    };
  }

  /**
   * Снимает фразы, которые заявитель уже говорил в последних репликах.
   *
   * На просьбу оператора повторить повтор и есть ответ, поэтому такой ход не
   * трогается.
   */
  private withoutRepeatedSentences(
    request: GenerateCallerReplyRequest,
    reply: CallerReply,
  ): CallerReply {
    if (request.context.turnPlan?.reactionAct === "repeat") {
      return reply;
    }

    const text = removeRepeatedSentences({
      text: reply.text,
      recentCallerReplies: request.context.recentTurns
        .filter((turn) => turn.role === "caller")
        .slice(-RECENT_CALLER_REPLIES)
        .map((turn) => turn.text),
      allowedFactValues: request.context.allowedFacts.map(({ value }) => value),
    });

    if (text === reply.text) {
      return reply;
    }

    this.logger.debug(
      `Dropped repeated sentences from a caller reply of ${request.sessionId}: «${reply.text}» → «${text}»`,
    );

    return { ...reply, text };
  }

  /** Оператор попросил повторить — тогда повтор и есть требуемый ответ. */
  private repeatsPreviousReply(
    request: GenerateCallerReplyRequest,
    text: string,
  ): boolean {
    if (request.context.turnPlan?.reactionAct === "repeat") {
      return false;
    }

    const previous = [...request.context.recentTurns]
      .reverse()
      .find((turn) => turn.role === "caller");

    return previous !== undefined && isNearRepetition(text, previous.text);
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
