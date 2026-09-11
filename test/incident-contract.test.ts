import { describe, expect, it } from "bun:test";

import { IncidentCardSchema } from "../src/contracts/incident";

const emptyBackendCard = {
  trainingSessionId: "session-1",
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
  incidentType: null,
  categories: [],
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
});
