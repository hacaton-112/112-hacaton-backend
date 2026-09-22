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
