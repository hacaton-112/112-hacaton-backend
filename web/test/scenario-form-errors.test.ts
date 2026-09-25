import { describe, expect, it } from "bun:test";

import {
  fieldErrorsFrom,
  findFieldError,
  isShownByField,
  withoutFieldErrors,
} from "../src/components/scenario-authoring/scenario-form-context";
import {
  createEmptyScenario,
  ScenarioSeedSchema,
} from "../src/contracts/scenario-authoring";

const emptyScenarioErrors = () => {
  const parsed = ScenarioSeedSchema.safeParse(createEmptyScenario());
  if (parsed.success) throw new Error("empty scenario must not be valid");
  return fieldErrorsFrom(parsed.error.issues);
};

describe("ошибки полей конструктора", () => {
  it("кладёт ошибку под поле по его пути и оставляет сообщения схемы", () => {
    const errors = emptyScenarioErrors();

    expect(errors.get("code")).toBe("Укажите код");
    expect(errors.get("location.exactPoint")).toBe(
      "Отметьте точку происшествия на карте",
    );
  });

  it("переводит стандартные сообщения zod", () => {
    const errors = emptyScenarioErrors();

    expect(errors.get("persona.displayName")).toBe("Не короче 2 символов");
    for (const message of errors.values()) {
      expect(message).not.toMatch(/^(Too small|Too big|Invalid)/);
    }
  });

  it("отдаёт полю ошибки вложенных значений, а exact — только свою", () => {
    const errors = new Map([["facts.0.contentKeywords.2", "Не короче 2"]]);

    expect(findFieldError(errors, "facts.0.contentKeywords")).toBe(
      "Не короче 2",
    );
    expect(findFieldError(errors, "facts.0.contentKeywords", true)).toBe(
      undefined,
    );
    expect(findFieldError(errors, "facts.0.content")).toBe(undefined);
  });

  it("правка поля снимает только его ошибки", () => {
    const errors = new Map([
      ["facts.0.key", "a"],
      ["facts.0.disclosure.keywords.0", "b"],
      ["facts.1.key", "c"],
    ]);

    expect([
      ...withoutFieldErrors(errors, "facts.0.disclosure.keywords").keys(),
    ]).toEqual(["facts.0.key", "facts.1.key"]);
    expect(withoutFieldErrors(errors, "title")).toBe(errors);
  });

  it("находит ошибки, для которых в форме нет поля", () => {
    const fields = ["facts", "facts.0.key"];

    expect(isShownByField("facts.0.key", fields)).toBe(true);
    expect(isShownByField("referenceCard.fields", fields)).toBe(false);
  });
});
