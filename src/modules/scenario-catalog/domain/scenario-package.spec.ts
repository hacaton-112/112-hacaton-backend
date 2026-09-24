import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseScenarioPackage } from "./scenario-package";

const validScenario = () =>
  JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        "drizzle",
        "seed",
        "scenarios",
        "s-015-fire-apartment.json",
      ),
      "utf8",
    ),
  ) as Record<string, unknown>;

const pack = (scenarios: unknown[]) => ({
  formatVersion: 1,
  exportedAt: "2026-09-24T12:00:00.000Z",
  scenarios,
});

describe(parseScenarioPackage.name, () => {
  it("accepts a valid portable scenario", () => {
    const result = parseScenarioPackage(pack([validScenario()]));
    expect(result.issues).toEqual([]);
    expect(result.scenarios).toHaveLength(1);
  });

  it("rejects every occurrence of a duplicate code", () => {
    const scenario = validScenario();
    const result = parseScenarioPackage(pack([scenario, scenario]));
    expect(result.scenarios).toEqual([]);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]?.reason).toContain("повторяется");
  });

  it("names an unknown category in Russian", () => {
    const original = validScenario();
    const scenario = { ...original, category: "unknown" };
    const result = parseScenarioPackage(pack([scenario]));
    expect(result.issues).toEqual([
      { code: String(original.code), reason: "Неизвестная категория сценария" },
    ]);
  });

  it("rejects an empty package", () => {
    expect(parseScenarioPackage(pack([])).issues).toEqual([
      { code: "пакет", reason: "Файл не содержит сценариев" },
    ]);
  });
});
