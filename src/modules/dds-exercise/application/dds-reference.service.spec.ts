import { latestVersionPerScenario } from "@/modules/scenario-catalog/domain/latest-version-per-scenario";

import { expectedCrewServiceFromScenario } from "./dds-reference.service";

describe(expectedCrewServiceFromScenario.name, () => {
  it.each([
    [["fire"], "dds_01"],
    [["police"], "dds_02"],
    [["ambulance"], "dds_03"],
    [["gas"], "dds_04"],
    [["unknown"], null],
  ] as const)(
    "maps scenario services deterministically",
    (services, expected) => {
      expect(expectedCrewServiceFromScenario(services)).toBe(expected);
    },
  );
});

describe("выбор текущей версии сценария", () => {
  it("берёт самую свежую версию каждого сценария", () => {
    const rows = [
      { scenarioId: "a", version: 3, id: "a3" },
      { scenarioId: "a", version: 1, id: "a1" },
      { scenarioId: "b", version: 2, id: "b2" },
      { scenarioId: "b", version: 7, id: "b7" },
    ];

    expect(
      latestVersionPerScenario(rows)
        .map(({ id }) => id)
        .sort(),
    ).toEqual(["a3", "b7"]);
  });

  it("возвращает по одной строке на сценарий", () => {
    expect(latestVersionPerScenario([])).toEqual([]);
    expect(
      latestVersionPerScenario([{ scenarioId: "a", version: 1, id: "a1" }]),
    ).toEqual([{ scenarioId: "a", version: 1, id: "a1" }]);
  });
});
