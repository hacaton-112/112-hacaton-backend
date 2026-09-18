import { scenarioTexts } from "./scenario-texts";

describe("scenarioTexts", () => {
  it("collects what the instructor typed, with the path as the identifier", () => {
    const texts = scenarioTexts({
      title: "Пожар в жилом доме",
      summary: "Заявитель видит огонь на балконе",
      persona: {
        displayName: "Мужчина, 34 года",
        speechStyle: "Говорит рублеными фразами",
      },
      version: {
        openingLine: "Горит квартира!",
        fallbackLine: "Повторите, плохо слышно",
      },
      facts: [
        {
          key: "incident_type",
          promptValue: "Горит квартира",
          displayLabel: "Что горит",
        },
      ],
      mandatoryQuestions: [{ text: "Точный адрес" }],
      referenceCard: {
        fields: [{ field: "street", expectedValue: "Учебная" }],
      },
    });

    expect(texts.map((text) => text.id)).toEqual([
      "title",
      "summary",
      "persona.displayName",
      "persona.speechStyle",
      "version.openingLine",
      "version.fallbackLine",
      "facts.0.promptValue",
      "facts.0.displayLabel",
      "mandatoryQuestions.0.text",
      "referenceCard.fields.0.expectedValue",
    ]);
  });

  it("names a fact by its key so the constructor can open it", () => {
    const [fact] = scenarioTexts({
      facts: [{ key: "door_code", promptValue: "Код домофона 1К45" }],
    });

    expect(fact).toMatchObject({
      id: "facts.0.promptValue",
      label: "Факт door_code: что говорит заявитель",
      style: "prose",
    });
  });

  it("reads a draft that does not pass the schema yet", () => {
    // Проверку просят после ручной правки, когда сценарий ещё неполный.
    expect(scenarioTexts({ version: { openingLine: "Горит!" } })).toEqual([
      expect.objectContaining({ id: "version.openingLine" }),
    ]);
    expect(scenarioTexts({ facts: "не массив", persona: null })).toEqual([]);
    expect(scenarioTexts(null)).toEqual([]);
    expect(scenarioTexts("сценарий")).toEqual([]);
  });

  it("skips empty and blank values", () => {
    expect(scenarioTexts({ title: "   ", summary: "" })).toEqual([]);
  });
});
