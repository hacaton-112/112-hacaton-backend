import { describe, expect, test } from "bun:test";
import {
  DialogueEntriesSchema,
  DialoguePreparationSchema,
} from "../src/contracts/dialogue-preparation";
import {
  createEmptyScenario,
  ScenarioSeedSchema,
} from "../src/contracts/scenario-authoring";
import {
  preparationCanPublish,
  scenarioPreparationKey,
} from "../src/components/scenario-authoring/dialogue-preparation-state";

const scenario = () => {
  const seed = createEmptyScenario();
  return ScenarioSeedSchema.parse({
    ...seed,
    code: "S-TEST",
    title: "Учебное происшествие",
    summary: "Синтетический случай для проверки подготовки.",
    persona: {
      ...seed.persona,
      code: "test-caller",
      displayName: "Учебная заявительница",
      condition: "Волнуется",
      speechStyle: "Говорит коротко, отвечает по существу.",
    },
    version: {
      ...seed.version,
      openingLine: "Помогите, человеку плохо!",
      fallbackLine: "Повторите, пожалуйста, не расслышала.",
    },
    location: {
      ...seed.location,
      exactPoint: [55.75, 37.61],
      locatorCenter: [55.75, 37.61],
      locatorLabel: "Учебный район",
    },
    facts: [
      { ...seed.facts[0], promptValue: "Человек упал и не может подняться." },
    ],
  });
};

describe("instructor dialogue preparation", () => {
  test("blocks publication of unfinished or stale preparations", () => {
    const seed = scenario();
    const selection = {
      id: "draft",
      snapshotKey: scenarioPreparationKey(seed)!,
      ready: true,
    };
    expect(preparationCanPublish(selection, seed)).toBe(true);
    expect(preparationCanPublish({ ...selection, ready: false }, seed)).toBe(
      false,
    );
    expect(preparationCanPublish({ ...selection, id: null }, seed)).toBe(false);
    expect(
      preparationCanPublish(selection, {
        ...seed,
        location: {
          ...seed.location,
          exactAddress: { street: "Другая учебная улица" },
        },
      }),
    ).toBe(false);
    expect(
      preparationCanPublish(selection, {
        ...seed,
        persona: { ...seed.persona, baseSpeechRate: 1.2 },
      }),
    ).toBe(false);
    expect(preparationCanPublish(null, seed)).toBe(true);
  });
  test("normalizes validated form values but rejects incomplete input", () => {
    const seed = scenario();
    expect(scenarioPreparationKey({ ...seed, title: ` ${seed.title} ` })).toBe(
      scenarioPreparationKey(seed),
    );
    expect(scenarioPreparationKey({})).toBeNull();
  });
  test("bank contract allows question edits, never AI addresses or arbitrary reply text", () => {
    const entry = {
      factKey: "address",
      questions: ["Назовите адрес происшествия?"],
      acknowledge: false,
    };
    expect(DialogueEntriesSchema.safeParse([entry]).success).toBe(true);
    expect(
      DialogueEntriesSchema.safeParse([{ ...entry, text: "Придуманный адрес" }])
        .success,
    ).toBe(false);
    expect(
      DialogueEntriesSchema.safeParse([
        { ...entry, questions: Array(5).fill("Что случилось?") },
      ]).success,
    ).toBe(false);
    expect(
      DialoguePreparationSchema.safeParse({ id: "not-an-id", status: "ready" })
        .success,
    ).toBe(false);
  });
});
