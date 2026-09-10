import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ScenarioSeedSchema } from "./scenario-seed.schema";

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
});
