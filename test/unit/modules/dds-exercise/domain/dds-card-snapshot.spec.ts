import type { DdsScenarioSource } from "@/modules/dds-exercise/ports/dds-exercise.store.port";

import { buildDdsCardSnapshot } from "@/modules/dds-exercise/domain/dds-card-snapshot";

const source = (
  overrides: Partial<DdsScenarioSource> = {},
): DdsScenarioSource => ({
  scenarioVersionId: "version-1",
  code: "S-FIRE-01",
  title: "Пожар в квартире",
  summary: "На пятом этаже горит квартира, внутри может быть ребёнок.",
  category: "fire",
  expectedServices: ["fire", "ambulance"],
  exactAddress: {
    city: "Москва",
    street: "Учебная улица",
    house: "12",
    apartment: "34",
  },
  exactLatitude: 55.75,
  exactLongitude: 37.61,
  locatorLabel: "Москва, учебный квартал",
  callerName: "Анна Максутова",
  callerNumber: "+79990000000",
  referenceFields: [
    { field: "category", expectedValue: "Пожар" },
    { field: "victims_total", expectedValue: "2 человека" },
  ],
  ...overrides,
});

describe(buildDdsCardSnapshot.name, () => {
  it("turns an immutable scenario version into a DDS card snapshot", () => {
    expect(buildDdsCardSnapshot(source())).toEqual({
      addressedService: "dds_01",
      snapshot: expect.objectContaining({
        addressText: "Москва, Учебная улица, 12, 34",
        incidentType: "Пожар",
        victimsTotal: 2,
        services: ["dds_01", "dds_03"],
      }),
    });
  });

  it("uses the category when a scenario has no explicit service", () => {
    expect(
      buildDdsCardSnapshot(
        source({ category: "medical", expectedServices: [] }),
      )?.addressedService,
    ).toBe("dds_03");
  });

  it("does not invent a service for an unclassified other scenario", () => {
    expect(
      buildDdsCardSnapshot(source({ category: "other", expectedServices: [] })),
    ).toBeNull();
  });
});
