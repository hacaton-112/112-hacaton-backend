import {
  loadTickets,
  ticketToScenario,
} from "@/drizzle/seed/tickets/ticket-scenarios";
import { buildDdsCardSnapshot } from "@/modules/dds-exercise/domain/dds-card-snapshot";

import { ScenarioSeedSchema } from "@/modules/scenario-engine/domain/scenario-seed.schema";

describe("ticket scenarios", () => {
  const tickets = loadTickets();

  it("reads every call of the exam tickets", () => {
    // 32 билета по 3 вызова, два повтора исключены.
    expect(tickets).toHaveLength(94);
    expect(new Set(tickets.map((ticket) => ticket.code)).size).toBe(94);
  });

  it.each(tickets.map((ticket) => [ticket.code, ticket] as const))(
    "%s passes the same schema as a hand-written scenario",
    (_code, ticket) => {
      const parsed = ScenarioSeedSchema.safeParse(ticketToScenario(ticket));

      expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
    },
  );

  it("gives the dispatcher a card for every ticket that needs a service", () => {
    const withoutCard = tickets.filter((ticket) => {
      const seed = ScenarioSeedSchema.parse(ticketToScenario(ticket));
      const card = buildDdsCardSnapshot({
        scenarioVersionId: seed.code,
        code: seed.code,
        title: seed.title,
        summary: seed.summary,
        category: seed.category,
        expectedServices: seed.version.expectedServices,
        exactAddress: seed.location.exactAddress,
        exactLatitude: seed.location.exactPoint[0],
        exactLongitude: seed.location.exactPoint[1],
        locatorLabel: seed.location.locatorLabel,
        callerNumber: seed.location.callerNumber,
        callerName: seed.persona.displayName,
        referenceFields: seed.referenceCard.fields.map((field) => ({
          field: field.field,
          expectedValue: field.expectedValue,
        })),
      });
      return card === null;
    });

    // Без карточки остаются только вызовы без службы из словаря 01–04:
    // пустой вызов и дела ЖКХ/УАДИТ/ЕДДС, до которых маршрутизация
    // назначенных карточек пока не дотягивается.
    expect(withoutCard.map((ticket) => ticket.code)).toEqual([
      "T02-2",
      "T27-3",
      "T28-3",
      "T32-3",
    ]);
  });
});
