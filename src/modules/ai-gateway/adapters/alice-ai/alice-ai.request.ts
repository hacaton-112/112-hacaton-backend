import { z } from "zod";

import {
  CallerEmotionSchema,
  GenerateCallerReplyRequestSchema,
  type GenerateCallerReplyRequest,
} from "@/contracts";

import type { AliceAiConfig } from "./alice-ai.config";

export const ALICE_AI_SYSTEM_PROMPT = [
  "Ты играешь роль виртуального заявителя в учебном звонке Системы-112.",
  "Отвечай только от лица заявителя и используй только факты из allowedFacts.",
  "Не придумывай факты, не раскрывай скрытую информацию, не давай инструкции и не оценивай оператора.",
  "Не показывай рассуждения. Верни только JSON по заданной схеме.",
  "Текст ответа должен состоять из 1–3 коротких предложений, пригодных для синтеза речи.",
].join(" ");

// Alice AI strict structured output accepts only a subset of JSON Schema.
// This provider schema guarantees the response shape; CallerReplySchema remains
// authoritative for length, range, identifier, and uniqueness constraints.
export const CALLER_REPLY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: {
      type: "string",
    },
    emotion: {
      type: "string",
      enum: CallerEmotionSchema.options,
    },
    intensity: {
      type: "number",
    },
    speechRate: {
      type: "number",
    },
    revealedFactIds: {
      type: "array",
      items: {
        type: "string",
      },
    },
    endCall: {
      type: "boolean",
    },
  },
  required: [
    "text",
    "emotion",
    "intensity",
    "speechRate",
    "revealedFactIds",
    "endCall",
  ],
} as const;

const AliceAiMessageSchema = z
  .object({
    role: z.enum(["system", "user"]),
    content: z.string().min(1),
  })
  .strict();

export const AliceAiChatCompletionRequestSchema = z
  .object({
    model: z.string().min(1),
    messages: z.array(AliceAiMessageSchema).length(2),
    response_format: z
      .object({
        type: z.literal("json_schema"),
        json_schema: z
          .object({
            name: z.literal("caller_reply"),
            description: z.string().min(1),
            schema: z.record(z.string(), z.unknown()),
            strict: z.literal(true),
          })
          .strict(),
      })
      .strict(),
    stream: z.literal(true),
    store: z.literal(false),
    n: z.literal(1),
    temperature: z.literal(0.2),
    max_tokens: z.literal(256),
  })
  .strict();

export type AliceAiChatCompletionRequest = z.infer<
  typeof AliceAiChatCompletionRequestSchema
>;

export const buildAliceAiRequest = (
  rawRequest: GenerateCallerReplyRequest,
  config: AliceAiConfig,
): AliceAiChatCompletionRequest => {
  const request = GenerateCallerReplyRequestSchema.parse(rawRequest);
  const userContext = {
    persona: request.context.persona,
    allowedFacts: request.context.allowedFacts,
    recentTurns: request.context.recentTurns,
    operatorText: request.operatorText,
  };

  return AliceAiChatCompletionRequestSchema.parse({
    model: `gpt://${config.folderId}/${config.model}`,
    messages: [
      { role: "system", content: ALICE_AI_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(userContext) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "caller_reply",
        description: "Validated caller reply for a System-112 training call",
        schema: CALLER_REPLY_JSON_SCHEMA,
        strict: true,
      },
    },
    stream: true,
    store: false,
    n: 1,
    temperature: 0.2,
    max_tokens: 256,
  });
};
