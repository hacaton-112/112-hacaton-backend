import type {
  CallerReactionAct,
  CallerTurnPlan,
} from "@/contracts";

import type { PanicLevel } from "./panic-scale";
import { normalizeForMatching } from "./disclosure";

export type CallerTurnTone = "neutral" | "calming" | "forbidden";

interface PlanCallerTurnInput {
  readonly rngSeed: string;
  readonly callerTurns: number;
  readonly operatorText: string;
  readonly panicLevel: PanicLevel;
  readonly tone: CallerTurnTone;
  readonly initiative: boolean;
  readonly freshFactIds: readonly string[];
  readonly focusFactIds: readonly string[];
}

const BASE_DELAY_MS: Record<CallerReactionAct, number> = {
  answer: 330,
  clarify: 480,
  acknowledge: 260,
  hesitate: 680,
  "self-correct": 590,
  repeat: 280,
  "emotional-reaction": 190,
  "panic-refusal": 160,
};

const MINIMUM_DELAY_MS = 120;
const MAXIMUM_DELAY_MS = 850;
const DELAY_JITTER_STEPS = 121;

/** Маленький стабильный хеш: вариативность воспроизводится внутри сессии. */
const stableHash = (value: string): number => {
  let hash = 2_166_136_261;

  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
};

const REPEAT_WORD_STEMS = ["повтор", "снова", "расслыш"] as const;
const REPEAT_PHRASES = [
  "еще раз",
  "плохо слыш",
  "что вы сказали",
] as const;

const QUESTION_WORD_STEMS = [
  "кто",
  "что",
  "где",
  "куда",
  "откуда",
  "когда",
  "почему",
  "зачем",
  "как",
  "како",
  "сколько",
  "назов",
  "скаж",
  "уточн",
] as const;

const normalizedWords = (text: string): readonly string[] =>
  normalizeForMatching(text).split(" ").filter(Boolean);

export const isExplicitRepeatRequest = (operatorText: string): boolean => {
  const normalized = normalizeForMatching(operatorText);
  const words = normalizedWords(operatorText);

  return (
    REPEAT_PHRASES.some((phrase) => normalized.includes(phrase)) ||
    words.some((word) =>
      REPEAT_WORD_STEMS.some((stem) => word.startsWith(stem)),
    )
  );
};

const isQuestionOrRequest = (operatorText: string): boolean => {
  const normalized = normalizeForMatching(operatorText);

  return (
    operatorText.includes("?") ||
    normalized.includes("есть ли") ||
    normalizedWords(operatorText).some((word) =>
      QUESTION_WORD_STEMS.some((stem) => word.startsWith(stem)),
    )
  );
};

const selectReactionAct = (
  input: PlanCallerTurnInput,
  variation: number,
): CallerReactionAct => {
  if (input.tone === "forbidden") {
    return "emotional-reaction";
  }

  if (input.tone === "calming") {
    return "acknowledge";
  }

  if (input.initiative) {
    return "emotional-reaction";
  }

  const wordCount = input.operatorText.trim().split(/\s+/u).length;

  if (input.panicLevel === 4 && wordCount >= 10) {
    return "panic-refusal";
  }

  if (isExplicitRepeatRequest(input.operatorText)) {
    return "repeat";
  }

  if (input.freshFactIds.length > 0 || input.focusFactIds.length > 0) {
    if (input.callerTurns > 1 && variation % 11 === 0) {
      return "self-correct";
    }

    if (variation % 5 === 0) {
      return "hesitate";
    }

    return "answer";
  }

  return isQuestionOrRequest(input.operatorText) ? "clarify" : "acknowledge";
};

const actsWithoutFacts = new Set<CallerReactionAct>([
  "clarify",
  "emotional-reaction",
  "panic-refusal",
]);

/**
 * Строит план следующего хода без участия LLM. Один и тот же снимок звонка и
 * текст оператора всегда дают один тип реакции и одну паузу.
 */
export const planCallerTurn = (input: PlanCallerTurnInput): CallerTurnPlan => {
  const variation = stableHash(
    `${input.rngSeed}:${input.callerTurns}:${input.operatorText}:${input.initiative}`,
  );
  const reactionAct = selectReactionAct(input, variation);
  const panicAdjustmentMs = input.panicLevel * 35;
  const jitterMs = variation % DELAY_JITTER_STEPS;
  const minimumResponseDelayMs = Math.min(
    Math.max(
      BASE_DELAY_MS[reactionAct] - panicAdjustmentMs + jitterMs,
      MINIMUM_DELAY_MS,
    ),
    MAXIMUM_DELAY_MS,
  );

  return {
    reactionAct,
    focusFactIds: actsWithoutFacts.has(reactionAct)
      ? []
      : [...input.focusFactIds],
    minimumResponseDelayMs,
  };
};

/** После снятия трубки паникующий заявитель начинает говорить чуть быстрее. */
export const planOpeningDelayMs = (
  rngSeed: string,
  panicLevel: PanicLevel,
): number => {
  const jitterMs = stableHash(`${rngSeed}:opening`) % 81;

  return Math.max(140, 260 - panicLevel * 25 + jitterMs);
};
