import { readFileSync } from "node:fs";
import { ScenarioSeedSchema } from "@/modules/scenario-engine/domain/scenario-seed.schema";
import {
  initialEntries,
  preparationHash,
  preparationRequests,
  questionPrompt,
  QuestionSuggestionsSchema,
  replyText,
  validateEntries,
} from "@/modules/scenario-audio/domain/dialogue-preparation";
import { audioFingerprint } from "@/modules/scenario-audio/domain/prepared-dialogue";

const scenario = () =>
  ScenarioSeedSchema.parse(
    JSON.parse(
      readFileSync("drizzle/seed/scenarios/s-015-fire-apartment.json", "utf8"),
    ),
  );

describe("draft dialogue snapshots", () => {
  it("uses canonical validated data, independent of object key ordering", () => {
    const seed = scenario();
    expect(preparationHash(seed)).toBe(
      preparationHash({
        ...seed,
        location: {
          ...seed.location,
          exactAddress: Object.fromEntries(
            Object.entries(seed.location.exactAddress).reverse(),
          ),
        },
      }),
    );
  });
  it.each(["address", "point", "voice", "disclosure", "text"])(
    "invalidates a snapshot when %s changes",
    (field) => {
      const seed = scenario();
      const changed = structuredClone(seed);
      if (field === "address") changed.location.exactAddress.house = "99";
      if (field === "point") changed.location.exactPoint[0] += 0.00001;
      if (field === "voice") changed.persona.baseSpeechRate = 1.2;
      if (field === "disclosure")
        changed.facts[0].disclosure = { type: "never" };
      if (field === "text")
        changed.facts[0].promptValue = "Другое учебное обстоятельство";
      expect(preparationHash(changed)).not.toBe(preparationHash(seed));
    },
  );
  it("rejects unknown, duplicated, missing facts and unbounded question variants", () => {
    const seed = scenario();
    const entries = initialEntries(seed);
    expect(() => validateEntries(seed, entries.slice(1))).toThrow();
    expect(() =>
      validateEntries(seed, [...entries.slice(1), entries[1]]),
    ).toThrow();
    expect(() =>
      validateEntries(
        seed,
        entries.map((entry, index) =>
          index ? entry : { ...entry, factKey: "unknown" },
        ),
      ),
    ).toThrow();
    expect(() =>
      validateEntries(
        seed,
        entries.map((entry) => ({
          ...entry,
          questions: Array(5).fill("Где произошло происшествие?"),
        })),
      ),
    ).toThrow();
  });
  it("keeps all factual wording verbatim and disallows model-authored answers", () => {
    const seed = scenario();
    const entry = initialEntries(seed)[0];
    expect(replyText(seed, entry)).toBe(seed.facts[0].promptValue);
    expect(replyText(seed, { ...entry, acknowledge: true })).toBe(
      `Хорошо. ${seed.facts[0].promptValue}`,
    );
    expect(
      QuestionSuggestionsSchema.safeParse({
        questions: ["Назовите адрес происшествия?"],
        address: "Придуманный адрес",
      }).success,
    ).toBe(false);
    expect(questionPrompt(["Назовите адрес происшествия?"])).not.toContain(
      seed.location.exactAddress.street,
    );
  });
  it("compiles unique full audio coverage across all voices in the panic range", () => {
    const seed = scenario();
    const requests = preparationRequests("draft-1", seed);
    expect(requests.length).toBeGreaterThan(0);
    expect(new Set(requests.map(audioFingerprint)).size).toBe(requests.length);
    for (const entry of initialEntries(seed)) {
      expect(
        requests.some((request) => request.text === replyText(seed, entry)),
      ).toBe(true);
      expect(
        requests.some(
          (request) =>
            request.text === replyText(seed, { ...entry, acknowledge: true }),
        ),
      ).toBe(true);
    }
    expect(requests.map(audioFingerprint)).toEqual(
      preparationRequests("published-version", seed).map(audioFingerprint),
    );
  });
  it("rejects partial coverage rather than declaring an overlong fact ready", () => {
    const seed = scenario();
    seed.facts[0].promptValue = "я".repeat(501);
    expect(() => preparationRequests("draft", seed)).toThrow("сократите");
  });
});
