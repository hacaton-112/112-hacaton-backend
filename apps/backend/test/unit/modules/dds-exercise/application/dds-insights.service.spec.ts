import { parseDdsInsights } from "@/modules/dds-exercise/application/dds-insights.service";

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

  it("drops the padding the model adds to fill a list", () => {
    expect(
      parseDdsInsights(
        {
          ...valid,
          weaknesses: [
            "Пропускает детали адреса",
            "",
            "-",
            "Пропускает детали адреса",
          ],
        },
        new Set(["FIRE-01"]),
      ).weaknesses,
    ).toEqual(["Пропускает детали адреса"]);
  });

  it("keeps only the lesson's own scenario codes", () => {
    expect(
      parseDdsInsights(
        { ...valid, focusScenarios: ["UNKNOWN", "FIRE-01"] },
        new Set(["FIRE-01"]),
      ).focusScenarios,
    ).toEqual(["FIRE-01"]);
  });

  it("rejects conclusions without any Russian text", () => {
    expect(() =>
      parseDdsInsights(
        { ...valid, strengths: ["Good work", "Fast response"] },
        new Set(["FIRE-01"]),
      ),
    ).toThrow();
  });
});
