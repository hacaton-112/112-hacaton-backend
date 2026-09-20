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
  ALICE_AI_QUESTION_PROMPT,
  ASKED_FACTS_JSON_SCHEMA,
  parseAliceAiQuestionResponse,
} from "../alice-ai/alice-ai.question";
import { parseAliceAiSse } from "../alice-ai/alice-ai.sse";
import { InferenceQueue } from "./inference-queue";
import {
  expandLocalReply,
  localReplyInput,
  localReplyJsonSchema,
  localReplyPrompt,
} from "./local-llm.reply";

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
    replyMaxTokens: z.coerce.number().int().min(64).max(512).default(192),
  })
  .strict();
export type LocalLlmConfig = z.infer<typeof LocalLlmConfigSchema>;

const CompletionSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().min(1) }) }))
    .min(1),
});

/**
 * Слоты llama-server, закреплённые за видами запросов.
 *
 * На CPU почти всё время хода уходит на разбор промпта, а не на генерацию.
 * llama-server не пересчитывает общий префикс с прошлым запросом того же
 * слота, но разбор вопроса и реплика заявителя идут на каждом ходе с разными
 * системными промптами: в одном слоте они вытесняли бы кеш друг друга, и
 * каждый ход считался бы с нуля. Сервер поэтому запускается с `--parallel 2`.
 */
const REPLY_SLOT = 0;
const QUESTION_SLOT = 1;

/** llama-server protocol. No cloud fallback and no unbounded waiting queue. */
export class LocalLlmAdapter implements LlmPort, QuestionUnderstandingPort {
  private readonly queue: InferenceQueue;
  readonly replyPolicy;
  constructor(
    private readonly config: LocalLlmConfig,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {
    this.replyPolicy = {
      retryNearRepetition: false,
      preserveLiteralText: config.literalFactReplies,
    };
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
          schema: localReplyJsonSchema(request),
          systemPrompt: localReplyPrompt(this.config.literalFactReplies),
          userPrompt: JSON.stringify(
            localReplyInput(request, this.config.literalFactReplies),
          ),
          maxTokens: this.config.replyMaxTokens,
          signal: deadline,
        },
        true,
        REPLY_SLOT,
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
      yield* expandLocalReply(
        parseAliceAiSse(response.body, deadline),
        request,
        deadline,
      );
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
        // Факты сценария одни на весь звонок: они идут первыми и остаются в
        // кеше, а заново считается только реплика оператора.
        userPrompt: JSON.stringify({
          facts: request.facts,
          operatorText: request.operatorText,
        }),
        maxTokens: 64,
        signal,
      },
      this.config.concurrency,
      QUESTION_SLOT,
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
    slot?: number,
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
        slot,
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
    slot?: number,
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
          temperature:
            request.schemaName === "asked_facts" ||
            this.config.literalFactReplies
              ? 0
              : 0.2,
          presence_penalty: 0,
          frequency_penalty: 0,
          repeat_penalty: 1,
          max_tokens: request.maxTokens,
          chat_template_kwargs: { enable_thinking: false },
          reasoning_effort: "none",
          cache_prompt: true,
          ...(slot === undefined ? {} : { id_slot: slot }),
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
