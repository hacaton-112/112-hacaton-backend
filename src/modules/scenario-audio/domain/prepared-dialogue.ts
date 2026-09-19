import { createHash } from "node:crypto";

import {
  TtsSynthesisRequestSchema,
  type FactQuestion,
  type TtsSynthesisRequest,
} from "@/contracts";
import {
  PANIC_LEVELS,
  resolveVoice,
} from "@/modules/scenario-engine/domain/panic-scale";
import type { ScenarioVersionSnapshot } from "@/modules/scenario-engine/ports/scenario-store.port";

export const normalizeQuestion = (text: string): string =>
  text
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

/** Exact authored question only: a substring would mistake negations for a question. */
export const resolvePreparedQuestion = (
  text: string,
  facts: readonly FactQuestion[],
): string[] | null => {
  const normalized = normalizeQuestion(text);
  if (!normalized) return null;
  const matched = facts.filter(
    (fact) => fact.question && normalizeQuestion(fact.question) === normalized,
  );
  return matched.length > 0 ? matched.map((fact) => fact.id) : null;
};

export const audioFingerprint = (request: TtsSynthesisRequest): string =>
  createHash("sha256")
    .update(
      JSON.stringify([
        "scenario-audio-v1",
        request.text,
        request.language,
        request.voiceId,
        request.gender,
        request.emotion,
        request.intensity,
        request.speechRate,
      ]),
    )
    .digest("hex");

/** No model writes facts here: these are the instructor's published utterances. */
export const compilePreparedSpeech = (
  version: ScenarioVersionSnapshot,
): TtsSynthesisRequest[] => {
  const texts = new Set([
    version.openingLine,
    version.fallbackLine,
    "Хорошо, я вас слышу.",
    "Алло? Ответьте мне, пожалуйста!",
    "Я не знаю! Пожалуйста, пусть быстрее едут!",
    "Я не успеваю понять. Говорите короче!",
    "Что? Я вас не понимаю, повторите!",
    ...version.facts.flatMap((fact) => [
      fact.promptValue,
      `Хорошо. ${fact.promptValue}`,
    ]),
  ]);
  const requests: TtsSynthesisRequest[] = [];
  for (const level of PANIC_LEVELS) {
    if (level < version.panicFloor || level > version.panicCeiling) continue;
    for (const text of texts) {
      const result = TtsSynthesisRequestSchema.safeParse({
        requestId: "preparation",
        sessionId: version.id,
        text,
        language: "Russian",
        voiceId: version.persona.voiceId,
        gender: version.persona.gender,
        ...resolveVoice(level, version.persona.baseSpeechRate),
      });
      // Never truncate a fact and then mark it as spoken in full.
      if (result.success) requests.push(result.data);
    }
  }
  return requests;
};
