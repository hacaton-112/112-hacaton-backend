import { z } from "zod";

import {
  CallerEmotionSchema,
  EMOTION_INTENSITY_RANGE,
  GenerateCallerReplyRequestSchema,
  SPEECH_RATE_RANGE,
  type CallerReactionAct,
  type GenerateCallerReplyRequest,
} from "@/contracts";

import type { AliceAiConfig } from "./alice-ai.config";

export const ALICE_AI_SYSTEM_PROMPT = [
  "Ты играешь роль виртуального заявителя в учебном звонке Системы-112.",
  "Отвечай только от лица заявителя и используй только факты из allowedFacts.",
  "Не придумывай факты, не раскрывай скрытую информацию, не давай инструкции и не оценивай оператора.",
  "Не показывай рассуждения. Верни только JSON по заданной схеме.",
  "Текст ответа должен состоять из 1–3 коротких предложений, пригодных для синтеза речи.",
  // Иначе заявитель продолжает свой рассказ, не замечая ни вопроса, ни того,
  // что оператор ему только что сказал.
  "Сначала ответь на последнюю реплику оператора и только потом добавь не больше одной новой подробности.",
  "allowedFacts уже отобраны Scenario Engine именно для текущего хода. Не пересказывай другие известные подробности и не повторяй недавнюю реплику, если turnPlan не требует repeat.",
  "Поле turnPlan задаёт обязательный тип реакции на этот ход; следуй его instruction, но не произноси название типа вслух.",
  "Говори так, как описано в persona: допустимы обрывки и повторы отдельных слов внутри новой реплики. Полностью повторяй недавнюю реплику только при reactionAct repeat.",
].join(" ");

export const REACTION_ACT_INSTRUCTIONS: Record<CallerReactionAct, string> = {
  answer: "Сразу и коротко ответь на последний вопрос оператора.",
  clarify: "Естественно попроси оператора уточнить непонятный вопрос.",
  acknowledge:
    "Коротко покажи, что услышал успокаивающую информацию, затем продолжи по существу.",
  hesitate:
    "Начни с короткой запинки или сомнения, затем ответь разрешёнными фактами.",
  "self-correct":
    "Один раз поправь только формулировку своей мысли, не меняя и не добавляя факты.",
  repeat: "Коротко повтори уже известную подходящую информацию.",
  "emotional-reaction":
    "Сначала естественно отреагируй на слова оператора, не добавляя запрещённых фактов.",
  "panic-refusal":
    "Покажи, что длинную реплику трудно понять в панике, и попроси говорить короче.",
};

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
    // Границы обязаны быть в схеме: без них модель отдаёт по шкале «до
    // десяти», реплика не проходит контракт и звонок теряет ход.
    intensity: {
      type: "number",
      minimum: EMOTION_INTENSITY_RANGE.min,
      maximum: EMOTION_INTENSITY_RANGE.max,
    },
    speechRate: {
      type: "number",
      minimum: SPEECH_RATE_RANGE.min,
      maximum: SPEECH_RATE_RANGE.max,
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
  const turnPlan = request.context.turnPlan;
  const userContext = {
    persona: request.context.persona,
    allowedFacts: request.context.allowedFacts,
    recentTurns: request.context.recentTurns,
    operatorText: request.operatorText,
    ...(turnPlan === undefined
      ? {}
      : {
          turnPlan: {
            reactionAct: turnPlan.reactionAct,
            focusFactIds: turnPlan.focusFactIds ?? [],
            instruction: REACTION_ACT_INSTRUCTIONS[turnPlan.reactionAct],
          },
        }),
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
