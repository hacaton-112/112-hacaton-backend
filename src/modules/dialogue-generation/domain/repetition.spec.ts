import { isNearRepetition } from "./repetition";

describe("isNearRepetition", () => {
  // Пять реплик подряд из настоящего учебного звонка: заявитель пересказывал
  // одно и то же, пока оператор пытался узнать код домофона.
  const spiral = [
    "Понял. Дети в дальней комнате, дверь горит. Быстрее приезжайте!",
    "Понял, дети в комнате, дверь горит. Быстрее приезжайте, они кричат!",
    "Дети в комнате! Дверь горит! Быстрее!",
    "Хорошо, жду. Дети в комнате, дверь горит!",
    "Хорошо, жду. Дверь горит, дети в комнате!",
  ];

  it.each(spiral.slice(1).map((text, index) => [text, spiral[index]!]))(
    "catches %s",
    (text, previous) => {
      expect(isNearRepetition(text, previous)).toBe(true);
    },
  );

  it("lets a different answer through", () => {
    expect(
      isNearRepetition(
        "Дом двенадцать, второй подъезд. Пятый этаж, дым везде!",
        "Улица Учебная.",
      ),
    ).toBe(false);
  });

  it("does not judge a reply too short to compare", () => {
    expect(isNearRepetition("Да!", "Да, горит!")).toBe(false);
  });

  it("ignores case, punctuation and the ё distinction", () => {
    expect(
      isNearRepetition(
        "ДЕТИ В КОМНАТЕ, ДВЕРЬ ГОРИТ!",
        "Дети в комнате… дверь горит",
      ),
    ).toBe(true);
  });
});
