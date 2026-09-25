import type { DdsCardSnapshot } from "@/modules/dds-exercise/dto/dds-exercise.dto";

import { validateCrewHandoff } from "@/modules/telephony/domain/crew-handoff-validation";

const CARD: DdsCardSnapshot = {
  scenarioCode: "road-1",
  title: "Наезд на пешехода",
  summary: "Водитель задел пешехода во дворе.",
  category: "road_accident",
  addressText: "Москва, улица Миклухо-Маклая, дом 2",
  latitude: 55.65,
  longitude: 37.5,
  callerName: null,
  callerPhone: null,
  incidentType: "Дорожно-транспортное происшествие",
  description: "Пешеход в сознании, жалуется на боль в ноге",
  victimsTotal: 1,
  services: ["dds_02", "dds_03"],
};

describe(validateCrewHandoff.name, () => {
  it("accepts a complete report despite Russian word endings", () => {
    const result = validateCrewHandoff(
      CARD,
      "Москва, Миклухо-Маклая, 2. Наезд на пешехода. Пострадавший в сознании, у него болит нога. Один пострадавший.",
    );

    expect(result).toEqual({
      complete: true,
      coveredFields: ["address", "incident", "description", "victims"],
      missingFields: [],
    });
  });

  it("does not accept arbitrary speech", () => {
    const result = validateCrewHandoff(CARD, "Добрый день, вы меня слышите?");

    expect(result.complete).toBe(false);
    expect(result.missingFields).toEqual([
      "address",
      "incident",
      "description",
      "victims",
    ]);
  });

  it("requires the exact house number", () => {
    const result = validateCrewHandoff(
      CARD,
      "Москва, Миклухо-Маклая, дом 8. Наезд на пешехода. Пешеход в сознании, болит нога. 1 пострадавший.",
    );

    expect(result.coveredFields).not.toContain("address");
    expect(result.coveredFields).toContain("victims");
  });

  it("accepts a house number written by ASR as a Russian word", () => {
    const result = validateCrewHandoff(
      CARD,
      "Москва, Миклухо-Маклая, дом два. Наезд на пешехода. Пешеход в сознании, болит нога. Один пострадавший.",
    );

    expect(result.coveredFields).toContain("address");
  });

  it("asks only for facts that are still missing across several phrases", () => {
    const first = "Москва, Миклухо-Маклая, дом 2. Наезд на пешехода.";
    const result = validateCrewHandoff(
      CARD,
      `${first} Пострадавший в сознании, болит нога.`,
    );

    expect(result.coveredFields).toEqual([
      "address",
      "incident",
      "description",
    ]);
    expect(result.missingFields).toEqual(["victims"]);
  });

  it("does not require a victim count that is unknown in the card", () => {
    const result = validateCrewHandoff(
      { ...CARD, victimsTotal: null },
      "Москва, Миклухо-Маклая, 2. Наезд на пешехода. Пешеход в сознании, болит нога.",
    );

    expect(result.missingFields).not.toContain("victims");
  });
});
