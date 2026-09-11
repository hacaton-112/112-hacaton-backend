import type { IncidentCard } from "@/modules/incident-card/dto/incident-card.dto";

import { cardValuesForReference, dispatchedServices } from "./card-mapping";

const card = (overrides: Partial<IncidentCard> = {}): IncidentCard =>
  ({
    trainingSessionId: "session-1",
    callerAnonymous: false,
    addressText: "улица Учебная, дом 12, подъезд 2",
    entrance: null,
    floor: "5",
    intercom: "1К45",
    placeNotes: null,
    incidentType: "Пожар",
    categories: ["threat_to_people"],
    victimsTotal: 3,
    victimsChildren: 2,
    description: "Дети в дальней комнате, дышат",
    services: ["dds_01", "dds_03"],
    victims: [],
    nearby: false,
    submittedAt: null,
    updatedAt: "2026-09-11T00:00:00.000Z",
    ...overrides,
  }) as IncidentCard;

describe("cardValuesForReference", () => {
  it("gives every part of the address the line the operator typed", () => {
    const values = cardValuesForReference(card());

    expect(values.street).toBe("улица Учебная, дом 12, подъезд 2");
    expect(values.house).toBe("улица Учебная, дом 12, подъезд 2");
  });

  it("keeps a field the operator filled separately ahead of the line", () => {
    expect(cardValuesForReference(card()).floor).toBe(
      "5 улица Учебная, дом 12, подъезд 2",
    );
  });

  it("turns a counter into the text the reference compares", () => {
    const values = cardValuesForReference(card());

    expect(values.children_count).toBe("2");
    expect(values.victims_total).toBe("3");
  });

  it("returns nothing for a card that was never filled", () => {
    expect(cardValuesForReference(null)).toEqual({});
  });
});

describe("dispatchedServices", () => {
  it("translates the ДДС numbers into the services a scenario knows", () => {
    expect(dispatchedServices(card())).toEqual(["fire", "ambulance"]);
  });

  it("drops a service the scenario vocabulary has no word for", () => {
    expect(dispatchedServices(card({ services: ["zhkh", "cuks"] }))).toEqual([]);
  });

  it("counts a service once when two buttons mean the same one", () => {
    expect(
      dispatchedServices(card({ services: ["dds_02", "rosgvardia"] })),
    ).toEqual(["police"]);
  });
});
