import { parseDdsInsights } from "./dds-insights.service";

const valid = {
  strengths: [
    "Уверенно соблюдает порядок статусов",
    "Быстро принимает карточки",
  ],
  weaknesses: ["Пропускает детали адреса", "Не всегда поясняет отказ"],
  recommendations: ["Повторить работу с адресом", "Отработать причины отказа"],
  focusScenarios: ["FIRE-01"],
};

describe("DDS group insights validation", () => {
  it("accepts Russian conclusions and lesson scenario codes", () => {
    expect(parseDdsInsights(valid, new Set(["FIRE-01"]))).toEqual(valid);
  });

  it("rejects conclusions without Cyrillic text", () => {
    expect(() =>
      parseDdsInsights(
        { ...valid, strengths: ["Good work", "Fast response"] },
        new Set(["FIRE-01"]),
      ),
    ).toThrow();
  });

  it("rejects a scenario absent from the lesson", () => {
    expect(() =>
      parseDdsInsights(
        { ...valid, focusScenarios: ["UNKNOWN"] },
        new Set(["FIRE-01"]),
      ),
    ).toThrow("которого не было в занятии");
  });
});
