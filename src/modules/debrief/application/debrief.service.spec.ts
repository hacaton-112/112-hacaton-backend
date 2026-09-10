import { AppException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";
import type { RecordingStorage } from "@/modules/call-recording/ports/recording-storage.port";
import type { IncidentCardService } from "@/modules/incident-card/application/incident-card.service";

import type { DebriefCall, DebriefStore } from "../ports/debrief.store.port";

import { DebriefService } from "./debrief.service";

const OFFERED = new Date("2026-09-10T10:00:00.000Z");
const ANSWERED = new Date("2026-09-10T10:00:09.000Z");
const ENDED = new Date("2026-09-10T10:04:09.000Z");

const call = (overrides: Partial<DebriefCall> = {}): DebriefCall => ({
  trainingSessionId: "session-1",
  operatorId: "operator-1",
  scenarioVersionId: "version-1",
  scenarioCode: "S-015",
  title: "Пожар в жилом доме",
  stage: "ended",
  offeredAt: OFFERED.toISOString(),
  answeredAt: ANSWERED.toISOString(),
  endedAt: ENDED.toISOString(),
  durationSeconds: 240,
  answerNormSeconds: 240,
  panicLevel: 4,
  revealedFactKeys: ["incident_type"],
  ...overrides,
});

const journal = [
  {
    sequence: 4,
    type: "operator.utterance",
    actor: "operator",
    occurredAt: new Date("2026-09-10T10:00:19.000Z"),
    payload: { text: "Что у вас случилось?" },
  },
  {
    sequence: 6,
    type: "fact.revealed",
    actor: "caller",
    occurredAt: new Date("2026-09-10T10:00:21.000Z"),
    payload: { key: "incident_type" },
  },
];

const facts = [
  { key: "incident_type", label: "Что горит", severity: "normal" as const },
  { key: "address_street", label: "Улица", severity: "normal" as const },
];

const questions = [
  {
    text: "Точный адрес",
    isCritical: true,
    satisfiedByFactKeys: ["address_street", "incident_type"],
  },
  {
    text: "Что горит",
    isCritical: true,
    satisfiedByFactKeys: ["incident_type"],
  },
];

const manifest = {
  segments: [
    {
      key: "calls/session-1/0001-operator.wav",
      track: "operator" as const,
      startMs: 30,
      durationMs: 4_582,
      sampleRate: 16_000,
    },
  ],
};

interface Mocks {
  store: Record<string, jest.Mock>;
  storage: { get: jest.Mock };
  cards: { get: jest.Mock };
}

const createService = (
  overrides: Partial<Mocks["store"]> = {},
  storageGet: jest.Mock = jest
    .fn()
    .mockResolvedValue(new TextEncoder().encode(JSON.stringify(manifest))),
): { service: DebriefService; mocks: Mocks } => {
  const mocks: Mocks = {
    store: {
      listCalls: jest.fn().mockResolvedValue([]),
      loadCall: jest.fn().mockResolvedValue(call()),
      loadJournal: jest.fn().mockResolvedValue(journal),
      loadFacts: jest.fn().mockResolvedValue(facts),
      loadQuestions: jest.fn().mockResolvedValue(questions),
      ...overrides,
    },
    storage: { get: storageGet },
    cards: { get: jest.fn().mockResolvedValue(null) },
  };

  return {
    service: new DebriefService(
      mocks.store as unknown as DebriefStore,
      mocks.storage as unknown as RecordingStorage,
      mocks.cards as unknown as IncidentCardService,
    ),
    mocks,
  };
};

const codeOf = async (action: () => Promise<unknown>): Promise<string> => {
  try {
    await action();
  } catch (error) {
    return error instanceof AppException ? error.code : "not-an-app-exception";
  }

  return "no-error";
};

describe(DebriefService.name, () => {
  it("counts the time to answer against the norm of the scenario", async () => {
    const { service } = createService();

    const debrief = await service.get("session-1", "operator-1");

    expect(debrief.timings).toEqual({
      answerSeconds: 9,
      answerNormSeconds: 240,
      durationSeconds: 240,
    });
  });

  it("shows what the operator got and what he never asked for", async () => {
    const { service } = createService();

    const debrief = await service.get("session-1", "operator-1");

    expect(debrief.facts).toEqual([
      expect.objectContaining({
        key: "incident_type",
        revealed: true,
        revealedAt: "2026-09-10T10:00:21.000Z",
      }),
      expect.objectContaining({
        key: "address_street",
        revealed: false,
        revealedAt: null,
      }),
    ]);
  });

  it("closes a question only when every fact behind it was said", async () => {
    const { service } = createService();

    const debrief = await service.get("session-1", "operator-1");

    // Назвать улицу — ещё не назвать адрес: вопрос закрыт целиком или никак.
    expect(debrief.questions).toEqual([
      expect.objectContaining({ text: "Точный адрес", satisfied: false }),
      expect.objectContaining({ text: "Что горит", satisfied: true }),
    ]);
  });

  it("measures the timeline from the moment the call was answered", async () => {
    const { service } = createService();

    const debrief = await service.get("session-1", "operator-1");

    // Те же нули, что и у смещений в записи: строку можно переслушать.
    expect(debrief.timeline[0]).toMatchObject({
      type: "operator.utterance",
      offsetMs: 10_000,
      details: { text: "Что у вас случилось?" },
    });
  });

  it("names the fact a journal entry is about", async () => {
    const { service } = createService();

    const debrief = await service.get("session-1", "operator-1");

    expect(debrief.timeline[1]?.details).toEqual({
      key: "incident_type",
      label: "Что горит",
    });
  });

  it("still shows the call when the recording is missing", async () => {
    const { service } = createService({}, jest.fn().mockResolvedValue(null));

    const debrief = await service.get("session-1", "operator-1");

    // Занятие могло идти с выключенной записью — лента и карточка на месте.
    expect(debrief.recording).toEqual([]);
    expect(debrief.timeline).toHaveLength(2);
  });

  it("survives a storage that refuses to answer", async () => {
    const { service } = createService(
      {},
      jest.fn().mockRejectedValue(new Error("storage is down")),
    );

    await expect(service.get("session-1", "operator-1")).resolves.toMatchObject(
      {
        recording: [],
      },
    );
  });

  it("hands the client an address of its own for every segment", async () => {
    const { service } = createService();

    const debrief = await service.get("session-1", "operator-1");

    expect(debrief.recording[0]).toEqual({
      track: "operator",
      startMs: 30,
      durationMs: 4_582,
      sampleRate: 16_000,
      url: "/api/v1/calls/session-1/recording/0",
    });
  });

  it("hides another operator's call behind the same answer as a missing one", async () => {
    const { service } = createService({
      loadCall: jest
        .fn()
        .mockResolvedValue(call({ operatorId: "someone-else" })),
    });

    await expect(
      codeOf(() => service.get("session-1", "operator-1")),
    ).resolves.toBe(ErrorCodes.CALL_NOT_FOUND);
  });

  it("refuses a recording segment that does not exist", async () => {
    const { service } = createService();

    await expect(
      codeOf(() => service.readSegment("session-1", "operator-1", 7)),
    ).resolves.toBe(ErrorCodes.RECORDING_NOT_FOUND);
  });

  it("reads the segment the manifest points at", async () => {
    const audio = new Uint8Array([1, 2, 3]);
    const get = jest
      .fn()
      .mockResolvedValueOnce(new TextEncoder().encode(JSON.stringify(manifest)))
      .mockResolvedValueOnce(audio);
    const { service } = createService({}, get);

    await expect(
      service.readSegment("session-1", "operator-1", 0),
    ).resolves.toEqual(audio);
    expect(get).toHaveBeenLastCalledWith("calls/session-1/0001-operator.wav");
  });
});
