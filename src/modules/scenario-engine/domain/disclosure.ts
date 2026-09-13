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
  /** Как факт называется в разборе и в вопросе к модели: «Код двери». */
  readonly displayLabel: string;
  readonly severity: FactSeverity;
  readonly disclosure: DisclosureRule;
  /** По каким словам слышно, что заявитель этот факт уже назвал. */
  readonly contentKeywords: readonly string[];
  readonly priority: number;
  readonly orderIndex: number;
}

export interface DisclosureContext {
  readonly revealedKeys: readonly string[];
  readonly operatorText: string;
  /**
   * О чём спросил оператор, по разбору модели.
   *
   * `undefined` — разбора нет: модель недоступна, ход без вопроса или сценарий
   * читает старый клиент. Тогда работает прежнее сравнение по словам автора, и
   * заявитель отвечает так же, как отвечал до появления разбора.
   */
  readonly askedFactKeys?: readonly string[];
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

/**
 * Совпадение с начала слова: «дет» обязано находиться в «детей», но не в
 * «видеть». Для вопроса оператора этого различия не требовалось, а для
 * содержания реплики оно решает, засчитан факт или нет.
 */
const includesAtWordStart = (haystack: string, needle: string): boolean => {
  let at = haystack.indexOf(needle);

  while (at >= 0) {
    if (at === 0 || haystack[at - 1] === " ") {
      return true;
    }

    at = haystack.indexOf(needle, at + 1);
  }

  return false;
};

/**
 * Несёт ли реплика содержание факта.
 *
 * Слова пишет автор сценария рядом с самим фактом, и проверяются они по тексту
 * заявителя — не по вопросу оператора, как в `on_question`. Факт без слов не
 * засчитывается никогда: молчаливое совпадение хуже пропуска.
 */
export const carriesFactContent = (
  text: string,
  keywords: readonly string[],
): boolean => {
  const normalized = normalizeForMatching(text);

  if (normalized.length === 0) {
    return false;
  }

  return keywords.some((keyword) => {
    const needle = normalizeForMatching(keyword);

    return needle.length > 0 && includesAtWordStart(normalized, needle);
  });
};

/**
 * Ключи фактов, содержание которых слышно в реплике заявителя.
 *
 * Набор фактов сюда передаётся уже суженным: заявитель не вправе открыть
 * словами то, что сценарий на этом ходу держит закрытым.
 */
export const factsCarriedBy = (
  text: string,
  facts: readonly ScenarioFact[],
): readonly string[] =>
  facts
    .filter((fact) => carriesFactContent(text, fact.contentKeywords))
    .map((fact) => fact.key);

const STAGE_ORDER: Record<CallStage, number> = {
  offered: 0,
  conversation: 1,
  wrap_up: 2,
  ended: 3,
  declined: 3,
};

export const isFactAvailable = (
  fact: Pick<ScenarioFact, "key" | "disclosure">,
  context: DisclosureContext,
): boolean => {
  const rule = fact.disclosure;

  switch (rule.type) {
    case "immediate":
      return true;
    case "on_question":
      // Разобранный вопрос главнее словаря автора: он понимает «кто дома?» там,
      // где список слов ждал «люди» или «внутри».
      return context.askedFactKeys === undefined
        ? matchesKeywords(context.operatorText, rule.keywords)
        : context.askedFactKeys.includes(fact.key);
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
        isFactAvailable(fact, context),
    )
    // Прямой ответ на текущий вопрос важнее фонового immediate-факта. Иначе
    // при малом бюджете паники вопрос об адресе снова получал описание пожара.
    // Приоритет и порядок остаются стабильным tie-breaker.
    .sort(
      (left, right) => {
        const leftAnswersQuestion =
          left.disclosure.type === "on_question" &&
          matchesKeywords(context.operatorText, left.disclosure.keywords);
        const rightAnswersQuestion =
          right.disclosure.type === "on_question" &&
          matchesKeywords(context.operatorText, right.disclosure.keywords);

        return (
          Number(rightAnswersQuestion) - Number(leftAnswersQuestion) ||
          right.priority - left.priority ||
          left.orderIndex - right.orderIndex
        );
      },
    )
    .slice(0, Math.max(budget, 0));

  return {
    facts: [...revealed, ...candidates].slice(0, MAX_ALLOWED_FACTS),
    fresh: candidates.map((fact) => fact.key),
  };
};
