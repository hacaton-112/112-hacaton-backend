import { z } from "zod";

import {
  UnderstandQuestionRequestSchema,
  UnderstoodQuestionSchema,
  type UnderstandQuestionRequest,
} from "@/contracts";

import type { AliceAiConfig } from "./alice-ai.config";

/**
 * Модель отвечает на один служебный вопрос: о чём спросил оператор.
 *
 * Она видит подписи фактов и вопросы чек-листа, но не их содержание: понимание
 * вопроса не должно становиться лазейкой к сведениям, которые сценарий держит
 * закрытыми.
 */
export const ALICE_AI_QUESTION_PROMPT = [
  "Ты помогаешь учебному тренажёру диспетчера Системы-112 разобрать вопрос оператора.",
  "Тебе дан список сведений, которые есть в сценарии: у каждого идентификатор, короткая подпись и вопрос, которым его получают.",
  "Верни идентификаторы тех сведений, о которых оператор спрашивает в своей реплике.",
  "Если оператор ни о чём из списка не спрашивает — поздоровался, успокаивает, уточняет услышанное — верни пустой список.",
  "Не придумывай идентификаторов: допустимы только те, что есть в списке.",
  "Оператор часто спрашивает не теми словами, которыми написан вопрос: «кто дома?» и «есть ли люди в помещении» — об одном и том же.",
  "Один вопрос может касаться нескольких сведений сразу: «улица, дом, квартира» — это три.",
  "Смотри, о ком спрашивают: вопрос о самом заявителе и вопрос о пострадавших — разные, и подменять один другим нельзя.",
  "Если точно подходящего сведения в списке нет — возвращай пустой список, даже когда какое-то кажется близким по теме. Пустой ответ лучше приблизительного.",
  "Верни только JSON по схеме, без рассуждений.",
].join(" ");

export const ASKED_FACTS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    askedFactIds: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["askedFactIds"],
} as const;

const AliceAiQuestionResponseSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            message: z.object({ content: z.string() }).loose(),
          })
          .loose(),
      )
      .min(1),
  })
  .loose();

export const buildAliceAiQuestionRequest = (
  rawRequest: UnderstandQuestionRequest,
  config: AliceAiConfig,
) => {
  const request = UnderstandQuestionRequestSchema.parse(rawRequest);

  return {
    model: `gpt://${config.folderId}/${config.model}`,
    messages: [
      { role: "system", content: ALICE_AI_QUESTION_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          operatorText: request.operatorText,
          facts: request.facts,
        }),
      },
    ],
    // Разбор вопроса — не творчество: одна и та же реплика должна разбираться
    // одинаково, иначе занятие перестанет быть воспроизводимым.
    temperature: 0,
    stream: false,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "asked_facts",
        strict: true,
        schema: ASKED_FACTS_JSON_SCHEMA,
      },
    },
  };
};

/**
 * Читает ответ модели и оставляет только те идентификаторы, которые есть в
 * сценарии: выдуманный факт не должен открыть ничего.
 */
export const parseAliceAiQuestionResponse = (
  payload: unknown,
  request: UnderstandQuestionRequest,
): readonly string[] => {
  const parsed = AliceAiQuestionResponseSchema.parse(payload);
  const content: unknown = JSON.parse(parsed.choices[0]!.message.content);
  const understood = UnderstoodQuestionSchema.parse(content);
  const known = new Set(request.facts.map((fact) => fact.id));

  return [...new Set(understood.askedFactIds)].filter((id) => known.has(id));
};
