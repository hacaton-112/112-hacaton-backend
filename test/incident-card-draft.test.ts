import { describe, expect, it } from "bun:test";

import {
  EMPTY_INCIDENT_CARD,
  IncidentCardSchema,
  type IncidentCard,
} from "../src/contracts/incident";
import {
  applyIncidentCardLocationDefaults,
  IncidentCardDraft,
} from "../src/services/incident-card-draft";

const emptyCard = (): IncidentCard =>
  IncidentCardSchema.parse(EMPTY_INCIDENT_CARD);

const inertScheduler = {
  setTimeout: () => 1,
  clearTimeout: () => undefined,
};

describe("IncidentCardDraft", () => {
  it("keeps edits from different operator panels in one card", () => {
    const draft = new IncidentCardDraft({
      save: async () => undefined,
      scheduler: inertScheduler,
    });

    draft.load(emptyCard());
    draft.update({ callerFirstName: "Анна" });
    draft.update({ services: ["dds_01"] });
    const card = draft.update({ description: "Дым в подъезде" });

    expect(card?.callerFirstName).toBe("Анна");
    expect(card?.services).toEqual(["dds_01"]);
    expect(card?.description).toBe("Дым в подъезде");
  });

  it("flushes the pending card before the call can end", async () => {
    const order: string[] = [];
    const draft = new IncidentCardDraft({
      save: async (card) => {
        order.push(`save:${card.description}`);
      },
      scheduler: inertScheduler,
    });

    draft.load(emptyCard());
    draft.update({ description: "Последняя фраза" });

    await draft.flush();
    order.push("end");

    expect(order).toEqual(["save:Последняя фраза", "end"]);
  });

  it("saves a service change even after the previous flush", async () => {
    const saves: IncidentCard[] = [];
    const draft = new IncidentCardDraft({
      save: async (card) => {
        saves.push(card);
      },
      scheduler: inertScheduler,
    });

    draft.load(emptyCard());
    draft.update({ addressText: "Москва, ул. Тестовая, д. 1" });
    await draft.flush();
    draft.update({ services: ["dds_03"] });
    await draft.flush();

    expect(saves).toHaveLength(2);
    expect(saves[1]?.addressText).toBe("Москва, ул. Тестовая, д. 1");
    expect(saves[1]?.services).toEqual(["dds_03"]);
  });

  it("drains an edit that arrives while a flush is in progress", async () => {
    const saves: Array<string | null> = [];
    let draft: IncidentCardDraft;
    draft = new IncidentCardDraft({
      save: async (card) => {
        saves.push(card.description);
        if (saves.length === 1) {
          draft.update({ description: "Второе изменение" });
        }
      },
      scheduler: inertScheduler,
    });

    draft.load(emptyCard());
    draft.update({ description: "Первое изменение" });
    await draft.flush();

    expect(saves).toEqual(["Первое изменение", "Второе изменение"]);
  });

  it("keeps a failed save pending for an explicit retry", async () => {
    let attempts = 0;
    const draft = new IncidentCardDraft({
      save: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("backend unavailable");
      },
      scheduler: inertScheduler,
    });

    draft.load(emptyCard());
    draft.update({ callerFirstName: "Анна" });

    await expect(draft.flush()).rejects.toThrow("backend unavailable");
    await draft.flush();

    expect(attempts).toBe(2);
  });
});

describe("applyIncidentCardLocationDefaults", () => {
  it("fills an empty card without overwriting restored operator values", () => {
    const located = applyIncidentCardLocationDefaults(emptyCard(), {
      addressText: "Определено по звонку",
      latitude: 55.75,
      longitude: 37.62,
    });
    const restored = applyIncidentCardLocationDefaults(
      IncidentCardSchema.parse({
        ...EMPTY_INCIDENT_CARD,
        addressText: "Уточнённый адрес",
        latitude: 55.7,
        longitude: 37.5,
      }),
      {
        addressText: "Новый ответ геолокатора",
        latitude: 1,
        longitude: 2,
      },
    );

    expect(located.addressText).toBe("Определено по звонку");
    expect(located.latitude).toBe(55.75);
    expect(restored.addressText).toBe("Уточнённый адрес");
    expect(restored.latitude).toBe(55.7);
    expect(restored.longitude).toBe(37.5);
  });
});
