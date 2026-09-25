import { isNearRepetition, removeRepeatedSentences } from "@/modules/dialogue-generation/domain/repetition";

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

describe("removeRepeatedSentences", () => {
  // Реплики из настоящего учебного звонка: хвост с детьми звучал в каждой.
  const recent = [
    "Да, слышу! Дети в квартире, быстрее приезжайте!",
    "Э-э... Там двое детей, они кричат из окна и выйти не могут!",
    "Пятый этаж, квартира тридцать четыре. Дети там, быстрее приезжайте!",
  ];

  it("drops a clause the caller keeps attaching to every reply", () => {
    expect(
      removeRepeatedSentences({
        text: "Э-э... Улица Учебная. Дети там, быстрее приезжайте!",
        recentCallerReplies: recent,
        allowedFactValues: ["Улица Учебная."],
      }),
    ).toBe("Э-э... Улица Учебная.");
  });

  it("keeps the answer to the current question even when it was said before", () => {
    // Оператор переспросил этаж: повторить ответ — правильно.
    expect(
      removeRepeatedSentences({
        text: "Пятый этаж, квартира тридцать четыре.",
        recentCallerReplies: recent,
        allowedFactValues: ["Пятый этаж, квартира 34."],
      }),
    ).toBe("Пятый этаж, квартира тридцать четыре.");
  });

  it("keeps the reply as it is when nothing new would be left", () => {
    // Замолчать хуже, чем повториться: целый пересказ ловит повторная попытка.
    expect(
      removeRepeatedSentences({
        text: "Дети там, быстрее приезжайте!",
        recentCallerReplies: recent,
        allowedFactValues: [],
      }),
    ).toBe("Дети там, быстрее приезжайте!");
  });

  it("recognises a repeat told in a different order", () => {
    expect(
      removeRepeatedSentences({
        text: "Хорошо, поняла. Тяжело дышит муж, всё ещё.",
        recentCallerReplies: ["Муж всё ещё тяжело дышит, лицо серое."],
        allowedFactValues: [],
      }),
    ).toBe("Хорошо, поняла.");
  });

  it("recognises a repeat through a different ending of a long word", () => {
    expect(
      removeRepeatedSentences({
        text: "Хорошо, поняла. Дверь в квартиру заперта.",
        recentCallerReplies: ["Дверь квартиры заперта на цепочку."],
        allowedFactValues: [],
      }),
    ).toBe("Хорошо, поняла.");
  });

  it("lets a new sentence that only shares a word or two through", () => {
    expect(
      removeRepeatedSentences({
        text: "Хорошо, жду на улице.",
        recentCallerReplies: ["Хорошо, жду."],
        allowedFactValues: [],
      }),
    ).toBe("Хорошо, жду на улице.");
  });

  it("compares with the last three replies only", () => {
    expect(
      removeRepeatedSentences({
        text: "Меня зовут Алексей. Дверь в коридор горит!",
        recentCallerReplies: [
          "Дверь в коридор горит!",
          "Улица Учебная.",
          "Дом двенадцать.",
          "Пятый этаж.",
        ],
        allowedFactValues: [],
      }),
    ).toBe("Меня зовут Алексей. Дверь в коридор горит!");
  });

  it("changes nothing at the start of the call", () => {
    expect(
      removeRepeatedSentences({
        text: "Горит квартира! Быстрее!",
        recentCallerReplies: [],
        allowedFactValues: [],
      }),
    ).toBe("Горит квартира! Быстрее!");
  });
});
