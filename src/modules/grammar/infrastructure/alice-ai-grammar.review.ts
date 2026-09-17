import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { AliceAiStructuredOutputClient } from "@/modules/ai-gateway/adapters/alice-ai/alice-ai-structured-output.client";

import type {
  GrammarReviewFinding,
  GrammarReviewInput,
  GrammarReviewPort,
} from "../ports/grammar-review.port";

export const GRAMMAR_REVIEW_SYSTEM_PROMPT = [
  "Ты проверяешь русский текст, который набрал диспетчер Системы-112 или преподаватель учебного тренажёра.",
  "Ищи орфографические ошибки, опечатки и несогласованные слова.",
  "Поле fragment обязано дословно совпадать с куском проверяемого текста: не пересказывай его и не исправляй прямо в нём.",
  "suggestion — исправленный вариант того же фрагмента; если однозначного исправления нет, верни null.",
  "message — короткое объяснение по-русски для стажёра, без терминов вроде «лексема» и «предикат».",
  // Диспетчер пишет коротко и обрывками: это норма работы, а не ошибка.
  "Не придирайся к сокращениям «д.», «кв.», «корп.», к отсутствию точки в конце короткой записи и к телеграфному стилю.",
  "Не предлагай переписать текст красивее и не оценивай работу диспетчера.",
  "Если ошибок нет, верни пустой список.",
  "Верни только JSON по схеме, без рассуждений.",
].join(" ");

export const GRAMMAR_REVIEW_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          textId: { type: "string" },
          fragment: { type: "string" },
          message: { type: "string" },
          suggestion: { type: ["string", "null"] },
        },
        required: ["textId", "fragment", "message", "suggestion"],
      },
    },
  },
  required: ["findings"],
} as const;

const MAX_FINDINGS = 40;

const GrammarReviewResponseSchema = z
  .object({
    findings: z
      .array(
        z
          .object({
            textId: z.string().trim().min(1),
            fragment: z.string().min(1),
            message: z.string().trim().min(1).max(300),
            suggestion: z.string().nullable(),
          })
          .loose(),
      )
      .max(MAX_FINDINGS),
  })
  .loose();

/** Проверка занимает больше времени, чем разбор вопроса: текста больше. */
const REVIEW_TIMEOUT_MS = 15_000;

/**
 * Углублённая проверка текста моделью.
 *
 * Модель видит только присланные тексты и возвращает фрагменты, которые
 * сервис ещё раз сверяет с оригиналом. Придуманное место ошибки до отчёта не
 * доходит.
 */
@Injectable()
export class AliceAiGrammarReview implements GrammarReviewPort {
  constructor(private readonly client: AliceAiStructuredOutputClient) {}

  async review(
    texts: readonly GrammarReviewInput[],
    signal: AbortSignal,
  ): Promise<readonly GrammarReviewFinding[]> {
    const raw = await this.client.complete({
      schemaName: "grammar_findings",
      schemaDescription: "Spelling and agreement problems of Russian text",
      schema: GRAMMAR_REVIEW_JSON_SCHEMA,
      systemPrompt: GRAMMAR_REVIEW_SYSTEM_PROMPT,
      userPrompt: JSON.stringify({
        texts: texts.map((text) => ({ id: text.id, value: text.value })),
      }),
      maxTokens: 2_048,
      signal: AbortSignal.any([signal, AbortSignal.timeout(REVIEW_TIMEOUT_MS)]),
    });
    const known = new Set(texts.map((text) => text.id));

    return GrammarReviewResponseSchema.parse(raw)
      .findings.filter((finding) => known.has(finding.textId))
      .map((finding) => ({
        textId: finding.textId,
        fragment: finding.fragment,
        message: finding.message,
        suggestion:
          finding.suggestion === null || finding.suggestion.trim().length === 0
            ? null
            : finding.suggestion,
      }));
  }
}
