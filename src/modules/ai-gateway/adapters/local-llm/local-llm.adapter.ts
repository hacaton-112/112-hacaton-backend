import { z } from "zod";

import {
  GenerateCallerReplyRequestSchema,
  UnderstandQuestionRequestSchema,
  type GenerateCallerReplyRequest,
  type LlmStreamEvent,
  type UnderstandQuestionRequest,
} from "@/contracts";
import type { LlmPort } from "../../ports/llm.port";
import type { QuestionUnderstandingPort } from "../../ports/question-understanding.port";
import type { StructuredOutputRequest } from "../alice-ai/alice-ai-structured-output.client";
import {
  ALICE_AI_SYSTEM_PROMPT,
  CALLER_REPLY_JSON_SCHEMA,
  REACTION_ACT_INSTRUCTIONS,
} from "../alice-ai/alice-ai.request";
import {
  ALICE_AI_QUESTION_PROMPT,
  ASKED_FACTS_JSON_SCHEMA,
  parseAliceAiQuestionResponse,
} from "../alice-ai/alice-ai.question";
import { parseAliceAiSse } from "../alice-ai/alice-ai.sse";
import { InferenceQueue } from "./inference-queue";

export const LocalLlmConfigSchema = z
  .object({
    baseUrl: z
      .url()
      .refine((url) => /^https?:\/\//.test(url))
      .transform((url) => url.replace(/\/+$/, "")),
    model: z.string().trim().min(1).max(200),
    apiKey: z.string().min(1).optional(),
    timeoutMs: z.coerce.number().int().min(500).max(30_000).default(8_000),
    concurrency: z.coerce.number().int().min(1).max(4).default(1),
    queueSize: z.coerce.number().int().min(0).max(16).default(0),
    queueWaitMs: z.coerce.number().int().min(10).max(2000).default(500),
    literalFactReplies: z.boolean().default(false),
  })
  .strict();
export type LocalLlmConfig = z.infer<typeof LocalLlmConfigSchema>;

const CompletionSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().min(1) }) }))
    .min(1),
});

/** llama-server protocol. No cloud fallback and no unbounded waiting queue. */
export class LocalLlmAdapter implements LlmPort, QuestionUnderstandingPort {
  private readonly queue: InferenceQueue;
  constructor(
    private readonly config: LocalLlmConfig,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {
    this.queue = new InferenceQueue(
      config.concurrency,
      config.queueSize,
      config.queueWaitMs,
    );
  }

  async *streamReply(
    raw: GenerateCallerReplyRequest,
    signal: AbortSignal,
  ): AsyncIterable<LlmStreamEvent> {
    const request = GenerateCallerReplyRequestSchema.parse(raw);
    const plan = request.context.turnPlan;
    const deadline = AbortSignal.any([
      signal,
      AbortSignal.timeout(this.config.timeoutMs),
    ]);
    const release = await this.queue.acquire(deadline);
    try {
      const response = await this.post(
        {
          schemaName: "caller_reply",
          schemaDescription: "Caller reply using only permitted facts",
          schema: CALLER_REPLY_JSON_SCHEMA,
          systemPrompt:
            ALICE_AI_SYSTEM_PROMPT +
            (this.config.literalFactReplies
              ? "\nOffline mode: text must be the exact concatenation of allowedFacts values corresponding to revealedFactIds, in the same order, separated by a space or '. '. Do not paraphrase or add clauses. An optional prefix 'Хорошо. ' is permitted. Do not invent facts."
              : ""),
          userPrompt: JSON.stringify({
            ...request.context,
            operatorText: request.operatorText,
            ...(plan
              ? {
                  turnPlan: {
                    ...plan,
                    instruction: REACTION_ACT_INSTRUCTIONS[plan.reactionAct],
                  },
                }
              : {}),
            ...(request.retryFeedback
              ? { retryFeedback: request.retryFeedback }
              : {}),
          }),
          maxTokens: 256,
          signal: deadline,
        },
        true,
      );
      if (
        !response.headers
          .get("content-type")
          ?.startsWith("text/event-stream") ||
        !response.body
      ) {
        throw new Error("Local LLM returned an invalid stream");
      }
      // The common SSE wire format is identical; collected JSON still passes the domain validator.
      yield* parseAliceAiSse(response.body, deadline);
    } finally {
      release();
    }
  }

  async understand(
    raw: UnderstandQuestionRequest,
    signal: AbortSignal,
  ): Promise<readonly string[]> {
    const request = UnderstandQuestionRequestSchema.parse(raw);
    const content = await this.run(
      {
        schemaName: "asked_facts",
        schemaDescription: "Known fact identifiers requested by the operator",
        schema: ASKED_FACTS_JSON_SCHEMA,
        systemPrompt: ALICE_AI_QUESTION_PROMPT,
        userPrompt: JSON.stringify({
          operatorText: request.operatorText,
          facts: request.facts,
        }),
        maxTokens: 128,
        signal,
      },
      this.config.concurrency,
    );
    return parseAliceAiQuestionResponse(
      { choices: [{ message: { content: JSON.stringify(content) } }] },
      request,
    );
  }

  /**
   * Структурный вызов из кабинета преподавателя.
   *
   * Последний свободный слот остаётся живому звонку: проверка грамотности и
   * помощник сценария подождут, а заявитель не должен из-за них переходить на
   * запасную реплику. При `LOCAL_LLM_CONCURRENCY=1` инструменты преподавателя
   * на локальной модели не работают вовсе — это осознанный выбор приоритета.
   */
  complete(request: StructuredOutputRequest): Promise<unknown> {
    return this.run(request, this.config.concurrency - 1);
  }

  /** Разбор вопроса — часть живого звонка и берёт весь запас. */
  private async run(
    request: StructuredOutputRequest,
    limit: number,
  ): Promise<unknown> {
    const deadline = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(this.config.timeoutMs),
    ]);
    const release = await this.queue.acquire(
      deadline,
      limit < this.config.concurrency,
    );
    try {
      const response = await this.post(
        {
          ...request,
          signal: deadline,
        },
        false,
      );
      const body = CompletionSchema.parse(await response.json());
      const content: unknown = JSON.parse(body.choices[0]!.message.content);
      return content;
    } finally {
      release();
    }
  }

  private async post(
    request: StructuredOutputRequest,
    stream: boolean,
  ): Promise<Response> {
    const response = await this.fetchImplementation(
      `${this.config.baseUrl}/chat/completions`,
      {
        method: "POST",
        redirect: "error",
        signal: request.signal,
        headers: {
          "Content-Type": "application/json",
          ...(this.config.apiKey
            ? { Authorization: `Bearer ${this.config.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: this.config.model,
          stream,
          temperature: 0.2,
          max_tokens: request.maxTokens,
          chat_template_kwargs: { enable_thinking: false },
          reasoning_effort: "none",
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
        }),
      },
    );
    if (!response.ok) {
      // Тело читается всегда: непрочитанный ответ держит соединение undici,
      // а в нём же лежит объяснение отказа.
      const detail = (await response.text().catch(() => ""))
        .trim()
        .slice(0, 200);
      throw new Error(
        `Local LLM HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      );
    }
    return response;
  }
}
