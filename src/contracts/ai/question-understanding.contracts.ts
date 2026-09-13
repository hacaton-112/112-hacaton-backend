import { z } from "zod";

import { AiIdentifierSchema, FactIdSchema } from "./generation.contracts";

/** Сколько фактов имеет смысл показывать модели за раз. */
export const MAX_QUESTION_FACTS = 64;
/** Сколько фактов может закрывать один вопрос оператора. */
export const MAX_ASKED_FACTS = 8;

/**
 * Факт в том виде, в каком о нём спрашивают.
 *
 * Модели показывается не содержание факта, а то, о чём он: подпись и вопрос
 * чек-листа, которым он закрывается. Содержание она узнает только если движок
 * решит, что факт разрешён, — иначе понимание вопроса стало бы лазейкой к
 * скрытым сведениям.
 */
export const FactQuestionSchema = z
  .object({
    id: FactIdSchema,
    label: z.string().trim().min(1).max(120),
    question: z.string().trim().max(300).nullable(),
  })
  .strict();

export const UnderstandQuestionRequestSchema = z
  .object({
    requestId: AiIdentifierSchema,
    operatorText: z.string().trim().min(1).max(2_000),
    facts: z.array(FactQuestionSchema).min(1).max(MAX_QUESTION_FACTS),
  })
  .strict();

export const UnderstoodQuestionSchema = z
  .object({
    /** Пусто — оператор спросил о том, чего в сценарии нет. */
    askedFactIds: z.array(FactIdSchema).max(MAX_ASKED_FACTS),
  })
  .strict();

export type FactQuestion = z.infer<typeof FactQuestionSchema>;
export type UnderstandQuestionRequest = z.infer<
  typeof UnderstandQuestionRequestSchema
>;
export type UnderstoodQuestion = z.infer<typeof UnderstoodQuestionSchema>;
