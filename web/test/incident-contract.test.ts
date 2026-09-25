import { describe, expect, it } from "bun:test";

import {
  CALLER_LANGUAGE_OPTIONS,
  IncidentCardDispatchReceiptSchema,
  IncidentCardSchema,
} from "../src/contracts/incident";

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
  it("offers common caller languages without duplicate values", () => {
    expect(CALLER_LANGUAGE_OPTIONS).toContain("Русский");
    expect(CALLER_LANGUAGE_OPTIONS).toContain("Азербайджанский");
    expect(CALLER_LANGUAGE_OPTIONS).toContain("Английский");
    expect(CALLER_LANGUAGE_OPTIONS).toContain("Китайский");
    expect(new Set(CALLER_LANGUAGE_OPTIONS).size).toBe(
      CALLER_LANGUAGE_OPTIONS.length,
    );
  });

  it("accepts an unfilled incident card returned by the backend", () => {
    const card = IncidentCardSchema.parse(emptyBackendCard);

    expect(card.latitude).toBeNull();
    expect(card.longitude).toBeNull();
    expect(card.victimsTotal).toBeNull();
    expect(card.deathsTotal).toBeNull();
    expect(card.callerFirstName).toBeNull();
    expect(card.city).toBeNull();
    expect(card.street).toBeNull();
    expect(card.house).toBeNull();
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

  it("keeps the editable address details returned by the backend", () => {
    const card = IncidentCardSchema.parse({
      ...emptyBackendCard,
      country: "  Россия ",
      federalSubject: "Москва",
      city: "Москва",
      street: "Учебная улица",
      house: "12",
      building: "2",
      corpus: "1",
      apartment: "34",
    });

    expect(card.country).toBe("Россия");
    expect(card.city).toBe("Москва");
    expect(card.street).toBe("Учебная улица");
    expect(card.house).toBe("12");
    expect(card.apartment).toBe("34");
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

describe("IncidentCardDispatchReceiptSchema", () => {
  it("accepts one independent delivery per addressed service", () => {
    const receipt = IncidentCardDispatchReceiptSchema.parse({
      trainingSessionId: "session-1",
      eventId: "e29a7c15-c910-4ae9-a778-d9a3d76e0bc7",
      dispatchedAt: "2026-09-18T12:00:00.000Z",
      deliveries: [
        {
          id: "68e4085a-a84f-435e-804f-8a242db80385",
          addressedService: "dds_01",
          acknowledgementDeadlineAt: "2026-09-18T12:00:30.000Z",
        },
        {
          id: "a95237ec-cf7c-4139-a96f-c6201800fd4f",
          addressedService: "dds_03",
          acknowledgementDeadlineAt: "2026-09-18T12:00:30.000Z",
        },
      ],
    });

    expect(receipt.deliveries.map((item) => item.addressedService)).toEqual([
      "dds_01",
      "dds_03",
    ]);
  });
});
