import { Injectable } from "@nestjs/common";

import {
  LlmStreamEventSchema,
  type CallerReply,
  type ScenarioFact,
} from "@/contracts";

import { LlmReplyCollectionError } from "../domain/llm-reply-collection.error";
import { CallerReplySafetyService } from "./caller-reply-safety.service";

export const MAX_RAW_LLM_RESPONSE_LENGTH = 4_096;

export interface CollectedCallerReply {
  readonly reply: CallerReply;
  readonly timeToFirstTokenMs: number | null;
  readonly durationMs: number;
}

@Injectable()
export class LlmReplyStreamCollector {
  constructor(private readonly safetyService: CallerReplySafetyService) {}

  async collect(
    stream: AsyncIterable<unknown>,
    allowedFacts: readonly ScenarioFact[],
    signal: AbortSignal,
  ): Promise<CollectedCallerReply> {
    const startedAt = performance.now();
    let firstTokenAt: number | null = null;
    let rawReply = "";
    let completed = false;

    signal.throwIfAborted();

    for await (const rawEvent of stream) {
      signal.throwIfAborted();

      if (completed) {
        throw new LlmReplyCollectionError(
          "protocol-error",
          "The LLM stream emitted an event after completion",
        );
      }

      const parsedEvent = LlmStreamEventSchema.safeParse(rawEvent);

      if (!parsedEvent.success) {
        throw new LlmReplyCollectionError(
          "invalid-event",
          "The LLM stream emitted an invalid event",
        );
      }

      if (parsedEvent.data.type === "response.completed") {
        completed = true;
        continue;
      }

      firstTokenAt ??= performance.now();
      rawReply += parsedEvent.data.delta;

      if (rawReply.length > MAX_RAW_LLM_RESPONSE_LENGTH) {
        throw new LlmReplyCollectionError(
          "response-too-large",
          "The raw LLM response exceeded the configured size limit",
        );
      }
    }

    signal.throwIfAborted();

    if (!completed || rawReply.length === 0) {
      throw new LlmReplyCollectionError(
        "protocol-error",
        "The LLM stream ended without a complete response",
      );
    }

    let parsedJson: unknown;

    try {
      parsedJson = JSON.parse(rawReply);
    } catch {
      throw new LlmReplyCollectionError(
        "invalid-json",
        "The LLM response is not valid JSON",
      );
    }

    const reply = this.safetyService.validate(parsedJson, allowedFacts);
    const finishedAt = performance.now();

    return {
      reply,
      timeToFirstTokenMs:
        firstTokenAt === null ? null : firstTokenAt - startedAt,
      durationMs: finishedAt - startedAt,
    };
  }
}
