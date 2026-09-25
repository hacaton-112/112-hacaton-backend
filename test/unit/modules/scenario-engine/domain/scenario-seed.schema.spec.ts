import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ScenarioSeedSchema } from "@/modules/scenario-engine/domain/scenario-seed.schema";

/** Проверяем схему на том же файле, которым засевается база. */
const seed = (): Record<string, unknown> =>
  JSON.parse(
    readFileSync(
      join(process.cwd(), "drizzle/seed/scenarios/s-015-fire-apartment.json"),
      "utf8",
    ),
  ) as Record<string, unknown>;

describe("ScenarioSeedSchema", () => {
  it("accepts the scenario shipped with the project", () => {
    expect(ScenarioSeedSchema.safeParse(seed()).success).toBe(true);
  });

  it("refuses a caller whose voice disagrees with his gender", () => {
    const broken = seed() as unknown as {
      persona: { voiceId: string; gender: string };
    };
    broken.persona.voiceId = "vivian";

    // Мужчина, заговоривший женским голосом, должен остановить засев, а не
    // дойти до занятия.
    expect(ScenarioSeedSchema.safeParse(broken).success).toBe(false);
  });

  it("refuses a voice the synthesiser has never heard of", () => {
    const broken = seed() as unknown as { persona: { voiceId: string } };
    broken.persona.voiceId = "боря";

    expect(ScenarioSeedSchema.safeParse(broken).success).toBe(false);
  });

  it("refuses duplicate fact keys before they reach the database", () => {
    const broken = seed() as unknown as { facts: Array<{ key: string }> };
    broken.facts[1].key = broken.facts[0].key;

    expect(ScenarioSeedSchema.safeParse(broken).success).toBe(false);
  });

  it("keeps the initial panic level inside the configured range", () => {
    const broken = seed() as unknown as {
      persona: { baselinePanicLevel: number };
      version: { panicFloor: number };
    };
    broken.version.panicFloor = 3;
    broken.persona.baselinePanicLevel = 2;

    expect(ScenarioSeedSchema.safeParse(broken).success).toBe(false);
  });

  it("requires the instructor to select location coordinates", () => {
    const broken = seed() as unknown as {
      location: {
        exactPoint: [number, number];
        locatorCenter: [number, number];
      };
    };
    broken.location.exactPoint = [0, 0];
    broken.location.locatorCenter = [0, 0];

    const result = ScenarioSeedSchema.safeParse(broken);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["location", "exactPoint"] }),
          expect.objectContaining({ path: ["location", "locatorCenter"] }),
        ]),
      );
    }
  });

  it("keeps the exact point inside the locator range", () => {
    const broken = seed() as unknown as {
      location: {
        exactPoint: [number, number];
        locatorCenter: [number, number];
        locatorRadiusMeters: number;
      };
    };
    broken.location.exactPoint = [55.751244, 37.618423];
    broken.location.locatorCenter = [55.761244, 37.618423];
    broken.location.locatorRadiusMeters = 100;

    expect(ScenarioSeedSchema.safeParse(broken).success).toBe(false);
  });

  it.each([
    ["openingLine", "Здравствуйте, служба 112, что случилось?"],
    ["fallbackLine", "Пожалуйста, расскажите подробнее, что произошло"],
  ] as const)("refuses an operator phrase in %s", (field, utterance) => {
    const broken = seed() as unknown as {
      version: { openingLine: string; fallbackLine: string };
    };
    broken.version[field] = utterance;

    const result = ScenarioSeedSchema.safeParse(broken);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["version", field] }),
        ]),
      );
    }
  });
});
