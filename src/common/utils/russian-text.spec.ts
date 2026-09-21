import { expandRussianAddressAbbreviations } from "./russian-text";

describe("expandRussianAddressAbbreviations", () => {
  it("разворачивает адресные сокращения по границам слов и сохраняет цифры", () => {
    expect(
      expandRussianAddressAbbreviations(
        "ул. Учебная, д. 12, корп. 2, кв. 34, под. 2, эт. 5, ш. 7, обл. 1, пр-т Мира",
      ),
    ).toBe(
      "улица Учебная, дом 12, корпус 2, квартира 34, подъезд 2, этаж 5, шоссе 7, область 1, проспект Мира",
    );
  });

  it("не заменяет сокращение внутри слова", () => {
    expect(expandRussianAddressAbbreviations("сад. и предпод. текст")).toBe(
      "сад. и предпод. текст",
    );
  });
});
