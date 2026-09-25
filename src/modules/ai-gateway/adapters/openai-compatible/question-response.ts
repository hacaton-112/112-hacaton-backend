import { z } from "zod";

import {
  UnderstoodQuestionSchema,
  type UnderstandQuestionRequest,
} from "@/contracts";

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

const QuestionResponseSchema = z
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

/**
 * Читает ответ модели и оставляет только те идентификаторы, которые есть в
 * сценарии: выдуманный факт не должен открыть ничего.
 */
export const parseQuestionResponse = (
  payload: unknown,
  request: UnderstandQuestionRequest,
): readonly string[] => {
  const parsed = QuestionResponseSchema.parse(payload);
  const content: unknown = JSON.parse(parsed.choices[0]!.message.content);
  const understood = UnderstoodQuestionSchema.parse(content);
  const known = new Set(request.facts.map((fact) => fact.id));

  return [...new Set(understood.askedFactIds)].filter((id) => known.has(id));
};
