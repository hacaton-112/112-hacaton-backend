import { z } from "zod";

import { FactIdSchema, MAX_ALLOWED_FACTS } from "@/contracts";
import type { CallStage, FactSeverity } from "@/drizzle/schema";

import { PANIC_LEVELS, type PanicLevel } from "./panic-scale";

/**
 * Условия раскрытия факта.
 *
 * Набор намеренно узкий: каждое условие проверяется детерминированно, без
 * обращения к модели, иначе воспроизводимость звонка теряется.
 */
export const DisclosureRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("immediate") }).strict(),
  z
    .object({
      type: z.literal("on_question"),
      keywords: z.array(z.string().trim().min(2)).min(1).max(32),
    })
    .strict(),
  z
    .object({
      type: z.literal("after_fact"),
      factKeys: z.array(FactIdSchema).min(1).max(16),
    })
    .strict(),
  z
    .object({
      type: z.literal("after_turns"),
      turns: z.number().int().min(1).max(50),
    })
    .strict(),
  z
    .object({
      type: z.literal("below_panic"),
      level: z.union(
        PANIC_LEVELS.map((level) => z.literal(level)) as [
          z.ZodLiteral<0>,
          z.ZodLiteral<1>,
          z.ZodLiteral<2>,
          z.ZodLiteral<3>,
          z.ZodLiteral<4>,
        ],
      ),
    })
    .strict(),
  z
    .object({
      type: z.literal("after_stage"),
      stage: z.enum(["offered", "conversation", "wrap_up"]),
    })
    .strict(),
  z.object({ type: z.literal("never") }).strict(),
]);

export type DisclosureRule = z.infer<typeof DisclosureRuleSchema>;

export interface ScenarioFact {
  readonly key: string;
  readonly promptValue: string;
  readonly severity: FactSeverity;
  readonly disclosure: DisclosureRule;
  readonly priority: number;
  readonly orderIndex: number;
}

export interface DisclosureContext {
  readonly revealedKeys: readonly string[];
  readonly operatorText: string;
  readonly callerTurns: number;
  readonly panicLevel: PanicLevel;
  readonly stage: CallStage;
}

/**
 * Приводит текст к виду, пригодному для поиска ключевых слов: регистр, ё и
 * пунктуация не должны решать, услышал ли заявитель вопрос.
 */
export const normalizeForMatching = (text: string): string =>
  text
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

/**
 * Совпадение по началу слова, а не по целому слову: «адрес» должен находиться
 * в «адреса» и «адресу», иначе сценарий пришлось бы писать со всеми падежами.
 */
export const matchesKeywords = (
  text: string,
  keywords: readonly string[],
): boolean => {
  const normalized = normalizeForMatching(text);

  if (normalized.length === 0) {
    return false;
  }

  return keywords.some((keyword) => {
    const needle = normalizeForMatching(keyword);

    return needle.length > 0 && normalized.includes(needle);
  });
};

const STAGE_ORDER: Record<CallStage, number> = {
  offered: 0,
  conversation: 1,
  wrap_up: 2,
  ended: 3,
  declined: 3,
};

export const isFactAvailable = (
  rule: DisclosureRule,
  context: DisclosureContext,
): boolean => {
  switch (rule.type) {
    case "immediate":
      return true;
    case "on_question":
      return matchesKeywords(context.operatorText, rule.keywords);
    case "after_fact":
      return rule.factKeys.every((key) => context.revealedKeys.includes(key));
    case "after_turns":
      return context.callerTurns >= rule.turns;
    case "below_panic":
      return context.panicLevel <= rule.level;
    case "after_stage":
      return STAGE_ORDER[context.stage] >= STAGE_ORDER[rule.stage];
    case "never":
      return false;
  }
};

export interface AllowedFacts {
  readonly facts: readonly ScenarioFact[];
  /** Ключи, впервые ставшие доступными на этом ходу. */
  readonly fresh: readonly string[];
}

/**
 * Собирает набор фактов для контекста модели.
 *
 * Уже прозвучавшие факты остаются доступными всегда: заявитель вправе повторить
 * сказанное, и на верхних ступенях он именно этим и занимается. Бюджет хода
 * ограничивает только новые факты — так паника слышна как сбивчивость, без
 * отдельных указаний модели.
 */
export const selectAllowedFacts = (
  facts: readonly ScenarioFact[],
  context: DisclosureContext,
  budget: number,
): AllowedFacts => {
  const revealed = facts.filter((fact) =>
    context.revealedKeys.includes(fact.key),
  );

  const candidates = facts
    .filter(
      (fact) =>
        !context.revealedKeys.includes(fact.key) &&
        isFactAvailable(fact.disclosure, context),
    )
    // Приоритет решает, кого назвать первым, когда условие выполнено сразу у
    // нескольких: без явного порядка выбор зависел бы от порядка строк в базе.
    .sort(
      (left, right) =>
        right.priority - left.priority || left.orderIndex - right.orderIndex,
    )
    .slice(0, Math.max(budget, 0));

  return {
    facts: [...revealed, ...candidates].slice(0, MAX_ALLOWED_FACTS),
    fresh: candidates.map((fact) => fact.key),
  };
};
