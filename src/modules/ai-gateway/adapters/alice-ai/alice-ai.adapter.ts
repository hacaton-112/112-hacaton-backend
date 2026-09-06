import { Inject, Injectable } from "@nestjs/common";

import type {
  GenerateCallerReplyRequest,
  LlmStreamEvent,
} from "@/contracts";
import type { LlmPort } from "@/modules/ai-gateway/ports/llm.port";

import type { AliceAiConfig } from "./alice-ai.config";
import { AliceAiError } from "./alice-ai.error";
import { buildAliceAiRequest } from "./alice-ai.request";
import { parseAliceAiSse } from "./alice-ai.sse";
import {
  ALICE_AI_CONFIG,
  ALICE_AI_FETCH,
  type AliceAiFetch,
} from "./alice-ai.tokens";

const isRetryableStatus = (status: number): boolean =>
  status === 408 || status === 429 || status >= 500;

@Injectable()
export class AliceAiLlmAdapter implements LlmPort {
  constructor(
    @Inject(ALICE_AI_CONFIG)
    private readonly config: AliceAiConfig,
    @Inject(ALICE_AI_FETCH)
    private readonly fetchImplementation: AliceAiFetch,
  ) {}

  async *streamReply(
    request: GenerateCallerReplyRequest,
    signal: AbortSignal,
  ): AsyncIterable<LlmStreamEvent> {
    signal.throwIfAborted();

    const timeoutSignal = AbortSignal.timeout(this.config.requestTimeoutMs);
    const requestSignal = AbortSignal.any([signal, timeoutSignal]);

    try {
      const response = await this.fetchImplementation(
        `${this.config.baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Api-Key ${this.config.apiKey}`,
            "Content-Type": "application/json",
            "OpenAI-Project": this.config.folderId,
          },
          body: JSON.stringify(buildAliceAiRequest(request, this.config)),
          signal: requestSignal,
        },
      );

      if (!response.ok) {
        throw new AliceAiError(
          "http-error",
          `Alice AI request failed with status ${response.status}`,
          {
            status: response.status,
            retryable: isRetryableStatus(response.status),
          },
        );
      }

      const contentType = response.headers.get("content-type")?.toLowerCase();

      if (contentType?.startsWith("text/event-stream") !== true) {
        throw new AliceAiError(
          "invalid-response",
          "Alice AI returned an unexpected content type",
        );
      }

      if (response.body === null) {
        throw new AliceAiError(
          "invalid-response",
          "Alice AI returned an empty response stream",
        );
      }

      yield* parseAliceAiSse(response.body, requestSignal);
    } catch (error) {
      if (signal.aborted) {
        signal.throwIfAborted();
      }

      if (timeoutSignal.aborted) {
        throw new AliceAiError("timeout", "Alice AI request timed out", {
          retryable: true,
        });
      }

      if (error instanceof AliceAiError) {
        throw error;
      }

      throw new AliceAiError(
        "transport-error",
        "Alice AI request failed before completion",
        { retryable: true },
      );
    }
  }
}
