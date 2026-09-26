import {
  callerV2FactsCarriedBy,
  russianNumbers,
} from "@/modules/scenario-engine/domain/caller-v2-fact-matching";
import type { ScenarioFact } from "@/modules/scenario-engine/domain/disclosure";

const fact = (key: string, promptValue: string): ScenarioFact => ({
  key,
  promptValue,
  displayLabel: key,
  severity: "normal",
  disclosure: { type: "immediate" },
  contentKeywords: [],
  priority: 1,
  orderIndex: 1,
});

describe("caller-v2 fact matching", () => {
  it("сопоставляет адрес по основам и числам, не открывая соседнюю квартиру", () => {
    const facts = [
      fact("street", "Улица Учебная."),
      fact("house", "Дом двенадцать, второй подъезд."),
      fact("flat", "Пятый этаж, квартира тридцать четыре."),
    ];
    expect(
      callerV2FactsCarriedBy("Учебная, дом двенадцать, второй подъезд.", facts),
    ).toEqual(["street", "house"]);
  });

  it("понимает собирательные числительные", () => {
    const facts = [
      fact(
        "children",
        "В квартире остались двое детей, они кричат из окна и выйти не могут.",
      ),
    ];
    expect(
      callerV2FactsCarriedBy("Да, там двое детей, они кричат!", facts),
    ).toEqual(["children"]);
  });

  it("не засчитывает адрес по одному родовому слову", () => {
    const facts = [fact("street", "Улица Учебная.")];
    expect(callerV2FactsCarriedBy("Не знаю, какая улица!", facts)).toEqual(
      [],
    );
    expect(callerV2FactsCarriedBy("Я на Учебной!", facts)).toEqual([
      "street",
    ]);
  });

  it("считает составные числительные до тысяч как числа", () => {
    expect(
      russianNumbers(
        "дом тысяча двести тридцать четыре, квартира 34, на пятом этаже",
      ),
    ).toEqual([1234, 34, 5]);
  });
});
