import { checkGrammar } from "@/modules/grammar/domain/grammar-rules";

const kinds = (value: string, style: "terse" | "prose" = "prose") =>
  checkGrammar(value, style).map((found) => found.kind);

describe("checkGrammar", () => {
  it("says nothing about a clean record", () => {
    expect(
      checkGrammar("Горит квартира на пятом этаже, дым в подъезде."),
    ).toEqual([]);
  });

  it("ignores an empty field", () => {
    // Незаполненное поле — вопрос к полноте карточки, а не к грамотности.
    expect(checkGrammar("   ")).toEqual([]);
  });

  it("catches latin letters hidden in a russian word", () => {
    const [found] = checkGrammar("Пoжар в подъезде");

    expect(found).toMatchObject({
      kind: "mixed-alphabet",
      severity: "error",
      fragment: "Пoжар",
      suggestion: "Пожар",
    });
  });

  it("catches a word typed twice", () => {
    const [found] = checkGrammar("Вызвали вызвали бригаду.");

    expect(found).toMatchObject({
      kind: "repeated-word",
      severity: "error",
      suggestion: "Вызвали",
    });
  });

  it("points at the place, not only at the text", () => {
    const value = "Дым идёт, пoжар на крыше.";
    const [found] = checkGrammar(value);

    expect(value.slice(found!.offset, found!.offset + found!.length)).toBe(
      "пoжар",
    );
  });

  it.each([
    ["Дым  в подъезде.", "double-space"],
    ["Дым в подъезде , горит крыша.", "space-before-punctuation"],
    ["Горит крыша.Вызвали пожарных.", "missing-space-after-punctuation"],
    ["горит крыша, дым в подъезде.", "lowercase-sentence-start"],
    ["ГОРИТ КРЫША", "caps-lock"],
    ["Пожар на 5этаже.", "digit-letter-glue"],
    ["Пожар (во дворе.", "unbalanced-bracket"],
    ["Пожар «Гранд.", "unbalanced-quote"],
    ["Горит!!! Приезжайте.", "repeated-punctuation"],
  ])("finds the problem in %s", (value, kind) => {
    expect(kinds(value)).toContain(kind);
  });

  it.each([
    "Улица Учебная, д. 12",
    "Кв. 3А, подъезд 1",
    "Вызваны МЧС и ДПС",
    "Пострадавших нет, т.е. помощь не нужна",
    "Дом 12, корп. 2",
  ])("leaves a normal card record alone: %s", (value) => {
    expect(checkGrammar(value, "terse")).toEqual([]);
  });

  it.each([
    "Вызов поступил в 10:30, бригада выехала",
    "Пожар на площади 12,5 метра",
    "Пострадавших нет, т.е. помощь не нужна",
    "МЧС, ДПС, СМП",
    "Горит на 3 этаже, кв. 12",
  ])("leaves a normal note of a dispatcher alone: %s", (value) => {
    // Правила prose читают адрес, примечания и описание: время, дробное
    // число, сокращение и перечисление служб там обычная запись.
    expect(checkGrammar(value, "prose")).toEqual([]);
  });

  it("still hears shouting in a written-out phrase", () => {
    expect(kinds("ГОРИТ КРЫША")).toContain("caps-lock");
  });

  it("does not demand a capital letter or a full stop in a short field", () => {
    // «улица Учебная» в поле адреса — норма, а не ошибка.
    expect(kinds("улица Учебная", "terse")).toEqual([]);
    expect(kinds("улица Учебная", "prose")).toContain(
      "lowercase-sentence-start",
    );
  });

  it("still reads a short field for confusable letters", () => {
    expect(kinds("Улицa Учебная", "terse")).toContain("mixed-alphabet");
  });

  it("sorts what it found by position in the text", () => {
    const found = checkGrammar("горит  крыша, пoжар сильный.");

    expect(found.map((item) => item.offset)).toEqual(
      [...found.map((item) => item.offset)].sort((left, right) => left - right),
    );
  });

  it("separates what hurts understanding from what only looks untidy", () => {
    const found = checkGrammar("Вызвали вызвали бригаду , быстро.");

    expect(
      found
        .filter((item) => item.severity === "error")
        .map((item) => item.kind),
    ).toEqual(["repeated-word"]);
    expect(
      found
        .filter((item) => item.severity === "style")
        .map((item) => item.kind),
    ).toEqual(["space-before-punctuation"]);
  });
});
