import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";

import type { AliceAiConfig } from "./alice-ai.config";
import { AliceAiError } from "./alice-ai.error";
import {
  ALICE_AI_CONFIG,
  ALICE_AI_FETCH,
  type AliceAiFetch,
} from "./alice-ai.tokens";
import type {
  StructuredOutputPort,
  StructuredOutputRequest,
} from "../../ports/structured-output.port";

export type { StructuredOutputRequest } from "../../ports/structured-output.port";

const StructuredCompletionResponseSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            message: z.object({ content: z.string().min(1) }).passthrough(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

const isRetryableStatus = (status: number): boolean =>
  status === 408 || status === 429 || status >= 500;

/** Shared non-streaming JSON-Schema client for Alice AI authoring tools. */
@Injectable()
export class AliceAiStructuredOutputClient implements StructuredOutputPort {
  constructor(
    @Inject(ALICE_AI_CONFIG)
    private readonly config: AliceAiConfig,
    @Inject(ALICE_AI_FETCH)
    private readonly fetchImplementation: AliceAiFetch,
  ) {}

  async complete(request: StructuredOutputRequest): Promise<unknown> {
    request.signal.throwIfAborted();

    const timeoutSignal = AbortSignal.timeout(this.config.requestTimeoutMs);
    const requestSignal = AbortSignal.any([request.signal, timeoutSignal]);

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
          body: JSON.stringify({
            model: `gpt://${this.config.folderId}/${this.config.model}`,
            messages: [
              { role: "system", content: request.systemPrompt },
              { role: "user", content: request.userPrompt },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: request.schemaName,
                description: request.schemaDescription,
                schema: request.schema,
                strict: true,
              },
            },
            stream: false,
            store: false,
            n: 1,
            temperature: 0.2,
            max_tokens: request.maxTokens,
          }),
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

      const envelope = StructuredCompletionResponseSchema.safeParse(
        await response.json(),
      );

      if (!envelope.success) {
        throw new AliceAiError(
          "invalid-response",
          "Alice AI returned an invalid completion envelope",
        );
      }

      try {
        return JSON.parse(envelope.data.choices[0].message.content) as unknown;
      } catch {
        throw new AliceAiError(
          "invalid-response",
          "Alice AI returned malformed JSON content",
        );
      }
    } catch (error) {
      if (request.signal.aborted) {
        request.signal.throwIfAborted();
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
        "Alice AI structured output request failed",
        { retryable: true },
      );
    }
  }
}
