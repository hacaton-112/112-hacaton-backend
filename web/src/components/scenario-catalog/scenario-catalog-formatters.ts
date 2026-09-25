import {
  CATEGORY_LABELS,
  SCENARIO_CATEGORIES,
} from "../../contracts/scenario-authoring";

type ScenarioCategory = (typeof SCENARIO_CATEGORIES)[number];

/** Цвет категории — имя шкалы темы: из него берутся фон, текст и точки. */
export type CategoryTone =
  "red" | "orange" | "blue" | "indigo" | "amber" | "gray";

export const CATEGORY_TONES: Record<ScenarioCategory, CategoryTone> = {
  fire: "red",
  road_accident: "orange",
  medical: "blue",
  criminal: "indigo",
  gas_leak: "amber",
  other: "gray",
};

const isKnownCategory = (category: string): category is ScenarioCategory =>
  (SCENARIO_CATEGORIES as readonly string[]).includes(category);

/**
 * Подпись и цвет категории.
 *
 * Список сценариев приходит нестрогой схемой, поэтому незнакомая категория
 * возможна: она показывается как есть, серым, а не роняет каталог.
 */
export const categoryAppearance = (
  category: string,
): { label: string; tone: CategoryTone } =>
  isKnownCategory(category)
    ? { label: CATEGORY_LABELS[category], tone: CATEGORY_TONES[category] }
    : { label: category, tone: "gray" };

/** Минуты и секунды разговора, как на макете: «06:12». */
export const formatClock = (seconds: number): string => {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);

  return `${String(minutes).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
};

const pluralForm = (
  count: number,
  [one, few, many]: readonly [string, string, string],
): string => {
  const lastTwo = count % 100;
  const last = count % 10;

  if (last === 1 && lastTwo !== 11) return one;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
  return many;
};

/** Заголовок каталога: «Доступно 5 сценариев». */
export const scenarioCountLabel = (count: number): string =>
  count === 0
    ? "Опубликованных сценариев нет"
    : `${pluralForm(count, ["Доступен", "Доступно", "Доступно"])} ${count} ${pluralForm(
        count,
        ["сценарий", "сценария", "сценариев"],
      )}`;
