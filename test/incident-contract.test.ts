import { describe, expect, it } from "bun:test";

import { IncidentCardSchema } from "../src/contracts/incident";

const emptyBackendCard = {
  trainingSessionId: "session-1",
  callerAnonymous: false,
  callerLastName: null,
  callerFirstName: null,
  callerMiddleName: null,
  callerLanguage: null,
  callerPhone: null,
  addressText: null,
  district: null,
  objectType: null,
  entrance: null,
  floor: null,
  intercom: null,
  latitude: null,
  longitude: null,
  nearby: false,
  placeNotes: null,
  classifierEntryId: null,
  classifierQualifierCodes: [],
  classifierRouting: null,
  incidentType: null,
  categories: [],
  startedAt: null,
  victimsTotal: null,
  victimsChildren: null,
  deathsTotal: null,
  deathsChildren: null,
  description: null,
  services: [],
  victims: [],
  submittedAt: null,
  updatedAt: "2026-09-10T10:00:00.000Z",
};

describe("IncidentCardSchema", () => {
  it("accepts an unfilled incident card returned by the backend", () => {
    const card = IncidentCardSchema.parse(emptyBackendCard);

    expect(card.latitude).toBeNull();
    expect(card.longitude).toBeNull();
    expect(card.victimsTotal).toBeNull();
    expect(card.deathsTotal).toBeNull();
    expect(card.callerFirstName).toBeNull();
    expect(card.classifierEntryId).toBeNull();
    expect(card.classifierRouting).toBeNull();
    expect(card.victims).toEqual([]);
  });

  it("still validates and normalizes non-empty numeric values", () => {
    const card = IncidentCardSchema.parse({
      ...emptyBackendCard,
      latitude: "55.75201",
      longitude: 37.6159,
      victimsTotal: "2",
    });

    expect(card.latitude).toBe(55.75201);
    expect(card.longitude).toBe(37.6159);
    expect(card.victimsTotal).toBe(2);
  });

  it("rejects coordinates outside their geographic range", () => {
    expect(
      IncidentCardSchema.safeParse({
        ...emptyBackendCard,
        latitude: 91,
      }).success,
    ).toBe(false);
  });

  it("keeps applicant and victim fields from the backend contract", () => {
    const card = IncidentCardSchema.parse({
      ...emptyBackendCard,
      callerFirstName: "  Анна  ",
      callerPhone: "79991234567",
      startedAt: "2026-09-10T09:30:00.000Z",
      victims: [
        {
          firstName: "Илья",
          reason: "Травма",
          birthDate: "2012-04-03",
          notes: "В сознании",
        },
      ],
    });

    expect(card.callerFirstName).toBe("Анна");
    expect(card.callerPhone).toBe("79991234567");
    expect(card.startedAt).toBe("2026-09-10T09:30:00.000Z");
    expect(card.victims).toEqual([
      {
        firstName: "Илья",
        reason: "Травма",
        birthDate: "2012-04-03",
        notes: "В сознании",
      },
    ]);
  });
});
