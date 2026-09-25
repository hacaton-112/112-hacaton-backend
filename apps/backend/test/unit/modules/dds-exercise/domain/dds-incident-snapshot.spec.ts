import type { DdsIncidentSource } from "@/modules/dds-exercise/domain/dds-incident-snapshot";
import { buildDdsIncidentSnapshot } from "@/modules/dds-exercise/domain/dds-incident-snapshot";

const source = (
  overrides: Partial<DdsIncidentSource> = {},
): DdsIncidentSource => ({
  scenarioCode: "S-01",
  scenarioTitle: "Учебный пожар",
  scenarioSummary: "Эталон не должен подменять карточку оператора",
  scenarioCategory: "fire",
  callerAnonymous: false,
  callerLastName: "Иванова",
  callerFirstName: "Анна",
  callerMiddleName: null,
  callerPhone: "+79990000000",
  addressText: "Москва, Учебная улица, 12",
  latitude: "55.750000",
  longitude: "37.610000",
  incidentType: "Пожар в квартире",
  classifierRouting: {
    classifierVersionId: "version-1",
    classifierEntryId: "entry-1",
    sourceCode: "FIRE-01",
    featurePath: ["Пожар"],
    finalType: "Пожар в квартире",
    ekpType: null,
    mainServiceCode: "dds_01",
    qualifierCodes: [],
    requiredServices: [],
  },
  description: "Дым из окна, внутри может быть человек",
  victimsTotal: 1,
  services: ["dds_01", "dds_03", "dds_01"],
  ...overrides,
});

describe(buildDdsIncidentSnapshot.name, () => {
  it("uses the actual operator values and deduplicates destinations", () => {
    const result = buildDdsIncidentSnapshot(source());

    expect(result).toMatchObject({
      ok: true,
      services: ["dds_01", "dds_03"],
      snapshot: {
        addressText: "Москва, Учебная улица, 12",
        incidentType: "Пожар в квартире",
        description: "Дым из окна, внутри может быть человек",
        callerName: "Иванова Анна",
        victimsTotal: 1,
      },
    });
  });

  it("does not dispatch an incomplete or unclassified card", () => {
    expect(
      buildDdsIncidentSnapshot(
        source({
          addressText: null,
          classifierRouting: null,
          services: [],
        }),
      ),
    ).toEqual({
      ok: false,
      missingFields: ["addressText", "classifierRouting", "services"],
    });
  });

  it("preserves an anonymous caller without inventing identity data", () => {
    const result = buildDdsIncidentSnapshot(
      source({
        callerAnonymous: true,
        callerLastName: null,
        callerFirstName: null,
      }),
    );

    expect(result.ok && result.snapshot.callerName).toBe("Анонимный заявитель");
  });
});
