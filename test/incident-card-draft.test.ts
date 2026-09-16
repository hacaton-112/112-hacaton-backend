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
      save: async (card) => card,
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
        return card;
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
        return card;
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
        return card;
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
      save: async (card) => {
        attempts += 1;
        if (attempts === 1) throw new Error("backend unavailable");
        return card;
      },
      scheduler: inertScheduler,
    });

    draft.load(emptyCard());
    draft.update({ callerFirstName: "Анна" });

    await expect(draft.flush()).rejects.toThrow("backend unavailable");
    await draft.flush();

    expect(attempts).toBe(2);
  });

  it("does not apply an older classifier response over a newer selection", async () => {
    const oldEntry = "52a2fb62-356f-49c0-a621-882af11e45c8";
    const newEntry = "1616d357-877e-491f-9626-e4bb9ed6a3a1";
    let releaseFirst: (() => void) | undefined;
    let announceStart: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      announceStart = resolve;
    });
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const savedSelections: Array<string | null> = [];
    let calls = 0;
    const draft = new IncidentCardDraft({
      save: async (card) => {
        calls += 1;
        if (calls === 1) {
          announceStart?.();
          await firstGate;
        }

        return IncidentCardSchema.parse({
          ...card,
          incidentType:
            card.classifierEntryId === oldEntry ? "Старый тип" : "Новый тип",
        });
      },
      onSaved: (card) => savedSelections.push(card.classifierEntryId),
      scheduler: inertScheduler,
    });

    draft.load(emptyCard());
    draft.update({ classifierEntryId: oldEntry });
    const flush = draft.flush();
    await firstStarted;
    draft.update({ classifierEntryId: newEntry });
    releaseFirst?.();
    await flush;

    expect(savedSelections[0]).toBe(newEntry);
    expect(draft.getSnapshot()?.classifierEntryId).toBe(newEntry);
    expect(draft.getSnapshot()?.incidentType).toBe("Новый тип");
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
