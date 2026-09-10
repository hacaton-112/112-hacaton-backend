import { SaveIncidentCardSchema } from "./incident-card.dto";

describe("SaveIncidentCardSchema", () => {
  it("accepts the card as the window fills it", () => {
    const parsed = SaveIncidentCardSchema.safeParse({
      callerAnonymous: false,
      callerLastName: "Максутов",
      callerPhone: "+7 916 204-71-33",
      addressText: "улица Учебная, дом 12, подъезд 2, этаж 5, квартира 34",
      district: "СЗАО",
      entrance: "2",
      floor: "5",
      intercom: "34К1245",
      latitude: 55.75201,
      longitude: 37.6159,
      nearby: true,
      incidentType: "Пожар",
      categories: ["threat_to_people", "important"],
      victimsTotal: 2,
      victimsChildren: 2,
      services: ["dds_01", "dds_03"],
      victims: [{ firstName: "Аня", reason: "Отравление дымом" }],
    });

    expect(parsed.success).toBe(true);
  });

  it("treats an empty box as a field the operator has not filled", () => {
    const parsed = SaveIncidentCardSchema.parse({ district: "   " });

    // Пустая строка и «не заполнено» — одно и то же, и в базе это null.
    expect(parsed.district).toBeNull();
  });

  it("refuses a service that is not on any button", () => {
    expect(
      SaveIncidentCardSchema.safeParse({ services: ["mchs"] }).success,
    ).toBe(false);
  });

  it("refuses coordinates off the planet", () => {
    expect(SaveIncidentCardSchema.safeParse({ latitude: 100 }).success).toBe(
      false,
    );
  });

  it("refuses a field the window never had", () => {
    expect(SaveIncidentCardSchema.safeParse({ operatorScore: 5 }).success).toBe(
      false,
    );
  });
});
