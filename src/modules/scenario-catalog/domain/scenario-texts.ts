import type { GrammarText, GrammarTextStyle } from "@/modules/grammar";

/**
 * Тексты сценария, которые написал человек.
 *
 * Читается черновик, а не готовый сценарий: преподаватель просит проверку
 * после ручной правки, когда сценарий ещё может не проходить схему. Поэтому
 * функция ничего не требует от формы данных и молча пропускает то, чего нет.
 *
 * Идентификатор совпадает с путём поля в сценарии: диалог проверки печатает
 * подпись поля, а перейти по нему в форму конструктор пока не умеет.
 */

const read = (source: unknown, path: readonly string[]): unknown =>
  path.reduce<unknown>((value, key) => {
    if (value === null || typeof value !== "object") {
      return undefined;
    }

    return (value as Record<string, unknown>)[key];
  }, source);

const text = (
  source: unknown,
  path: string,
  label: string,
  style: GrammarTextStyle,
): GrammarText | null => {
  const value = read(source, path.split("."));

  return typeof value === "string" && value.trim().length > 0
    ? { id: path, label, value, style }
    : null;
};

const list = (source: unknown, path: string): readonly unknown[] => {
  const value = read(source, path.split("."));

  return Array.isArray(value) ? value : [];
};

const SCENARIO_FIELDS: readonly [string, string, GrammarTextStyle][] = [
  ["title", "Название", "terse"],
  ["summary", "Краткое описание", "prose"],
  ["persona.displayName", "Кто звонит", "terse"],
  ["persona.condition", "Состояние заявителя", "prose"],
  ["persona.speechStyle", "Манера речи", "prose"],
  ["persona.backgroundSounds", "Фон", "terse"],
  ["version.openingLine", "Первая реплика", "prose"],
  ["version.fallbackLine", "Запасная реплика", "prose"],
  ["version.referenceNotes", "Заметки к эталону", "prose"],
  ["location.locatorLabel", "Подпись области", "terse"],
  ["referenceCard.notes", "Заметки к карточке", "prose"],
];

export const scenarioTexts = (scenario: unknown): readonly GrammarText[] => {
  const texts: GrammarText[] = [];

  for (const [path, label, style] of SCENARIO_FIELDS) {
    const found = text(scenario, path, label, style);

    if (found !== null) {
      texts.push(found);
    }
  }

  list(scenario, "facts").forEach((fact, index) => {
    const key = read(fact, ["key"]);
    const name = typeof key === "string" ? key : `${index + 1}`;

    for (const [field, label, style] of [
      ["promptValue", `Факт ${name}: что говорит заявитель`, "prose"],
      ["displayLabel", `Факт ${name}: подпись`, "terse"],
      ["cardValue", `Факт ${name}: значение для карточки`, "terse"],
    ] as const) {
      const found = text(fact, field, label, style);

      if (found !== null) {
        texts.push({ ...found, id: `facts.${index}.${field}` });
      }
    }
  });

  list(scenario, "mandatoryQuestions").forEach((question, index) => {
    const found = text(
      question,
      "text",
      `Обязательный вопрос ${index + 1}`,
      "prose",
    );

    if (found !== null) {
      texts.push({ ...found, id: `mandatoryQuestions.${index}.text` });
    }
  });

  list(scenario, "referenceCard.fields").forEach((field, index) => {
    const name = read(field, ["field"]);
    const label =
      typeof name === "string"
        ? `Эталон: ${name}`
        : `Эталон, поле ${index + 1}`;
    const found = text(field, "expectedValue", label, "terse");

    if (found !== null) {
      texts.push({
        ...found,
        id: `referenceCard.fields.${index}.expectedValue`,
      });
    }
  });

  return texts;
};
