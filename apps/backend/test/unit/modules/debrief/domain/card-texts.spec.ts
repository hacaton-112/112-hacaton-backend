import type { IncidentCard } from "@/modules/incident-card/dto/incident-card.dto";

import { incidentCardTexts } from "@/modules/debrief/domain/card-texts";

const card = (overrides: Partial<IncidentCard> = {}): IncidentCard =>
  ({
    trainingSessionId: "session-1",
    callerAnonymous: false,
    nearby: false,
    categories: [],
    classifierEntryId: null,
    classifierQualifierCodes: [],
    classifierRouting: null,
    services: [],
    victims: [],
    submittedAt: null,
    updatedAt: "2026-09-16T10:00:00.000Z",
    ...overrides,
  }) as IncidentCard;

describe("incidentCardTexts", () => {
  it("takes only the fields a person types", () => {
    const texts = incidentCardTexts(
      card({
        addressText: "Улица Учебная, дом 12",
        description: "Горит квартира на пятом этаже",
        latitude: 55.75,
        victimsTotal: 2,
        callerPhone: "+7 916 000-00-00",
      }),
    );

    expect(texts.map((text) => text.id)).toEqual([
      "addressText",
      "description",
    ]);
  });

  it("skips an empty card and empty fields", () => {
    expect(incidentCardTexts(null)).toEqual([]);
    expect(incidentCardTexts(card({ description: "   " }))).toEqual([]);
  });

  it("reads a short field differently from a description", () => {
    const texts = incidentCardTexts(
      card({ district: "Тверской", description: "Горит крыша" }),
    );

    expect(texts).toEqual([
      expect.objectContaining({ id: "district", style: "terse" }),
      expect.objectContaining({ id: "description", style: "prose" }),
    ]);
  });

  it("names every victim by their place in the list", () => {
    const texts = incidentCardTexts(
      card({
        victims: [
          { lastName: "Иванов", notes: "Ожог руки" },
          { lastName: "Петрова" },
        ],
      }),
    );

    expect(texts.map((text) => [text.id, text.label])).toEqual([
      ["victims.0.lastName", "Пострадавший 1: фамилия"],
      ["victims.0.notes", "Пострадавший 1: примечания"],
      ["victims.1.lastName", "Пострадавший 2: фамилия"],
    ]);
  });
});
