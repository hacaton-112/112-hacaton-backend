import { AppException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";
import { toPcmBytes } from "@/modules/call-recording/domain/mixdown";
import { encodeWav } from "@/modules/call-recording/domain/wav";
import type { RecordingStorage } from "@/modules/call-recording/ports/recording-storage.port";
import { GrammarService } from "@/modules/grammar";
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
  expectedDurationSeconds: 372,
  passThreshold: 75,
  difficulty: 3,
  expectedServices: ["fire"],
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
  storage: { get: jest.Mock; put: jest.Mock };
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
      loadReferenceCard: jest.fn().mockResolvedValue([]),
      loadScore: jest.fn().mockResolvedValue(null),
      saveScore: jest.fn().mockResolvedValue(undefined),
      loadGroupResult: jest
        .fn()
        .mockResolvedValue({ averageScore: 0, calls: 0 }),
      ...overrides,
    },
    storage: { get: storageGet, put: jest.fn().mockResolvedValue(undefined) },
    cards: { get: jest.fn().mockResolvedValue(null) },
  };

  return {
    service: new DebriefService(
      mocks.store as unknown as DebriefStore,
      mocks.storage as unknown as RecordingStorage,
      mocks.cards as unknown as IncidentCardService,
      new GrammarService(),
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
      expectedDurationSeconds: 372,
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

  it("reads the text the operator typed into the card", async () => {
    const { service, mocks } = createService();
    mocks.cards.get.mockResolvedValue({
      trainingSessionId: "session-1",
      callerAnonymous: false,
      addressText: "Улицa Учебная, дом 12",
      description: "Горит крыша , дым в подъезде.",
      categories: [],
      nearby: false,
      services: [],
      victims: [],
      submittedAt: null,
      updatedAt: new Date().toISOString(),
    });

    const debrief = await service.get("session-1", "operator-1");

    // Отчёт о занятии по ТЗ включает грамматику, но на балл она не влияет.
    expect(debrief.grammar).toMatchObject({
      errorCount: 1,
      styleCount: 1,
      reviewedByModel: false,
    });
    expect(
      debrief.grammar.fields.map((field) => [field.id, field.issues.length]),
    ).toEqual([
      ["addressText", 1],
      ["description", 1],
    ]);
  });

  it("keeps the grammar section empty when the card has no text", async () => {
    const { service } = createService();

    const debrief = await service.get("session-1", "operator-1");

    expect(debrief.grammar).toEqual({
      fields: [],
      errorCount: 0,
      styleCount: 0,
      reviewedByModel: false,
    });
  });

  it("scores a finished call and keeps the score", async () => {
    const { service, mocks } = createService({
      loadReferenceCard: jest.fn().mockResolvedValue([
        {
          field: "street",
          expectedValue: "Учебная",
          acceptableValues: [],
          comparison: "normalized",
          isRequired: true,
        },
      ]),
    });
    mocks.cards.get.mockResolvedValue({
      trainingSessionId: "session-1",
      callerAnonymous: false,
      // Адрес одной строкой: части сверяются вхождением, а не целиком.
      addressText: "улица Учебная, дом 12",
      categories: [],
      nearby: false,
      services: ["dds_01"],
      victims: [],
      submittedAt: null,
      updatedAt: new Date().toISOString(),
    });

    const debrief = await service.get("session-1", "operator-1");

    expect(debrief.evaluation).toMatchObject({
      verdict: expect.any(String),
      passThreshold: 75,
      difficulty: 3,
      groupAverageScore: null,
      groupCalls: 0,
    });
    expect(debrief.evaluation?.skills.map((skill) => skill.key)).toEqual([
      "questioning",
      "card",
      "services",
      "regulations",
    ]);
    expect(mocks.store.saveScore).toHaveBeenCalledWith(
      "session-1",
      "version-1",
      debrief.evaluation?.score,
    );
  });

  it("does not judge a call that is still running", async () => {
    const { service, mocks } = createService({
      loadCall: jest.fn().mockResolvedValue(call({ stage: "conversation" })),
    });

    const debrief = await service.get("session-1", "operator-1");

    expect(debrief.evaluation).toBeNull();
    expect(mocks.store.saveScore).not.toHaveBeenCalled();
  });

  it("offers the whole recording only when something was recorded", async () => {
    const { service } = createService();
    const withRecording = await service.get("session-1", "operator-1");

    expect(withRecording.recordingUrl).toBe(
      "/api/v1/calls/session-1/recording",
    );

    const { service: silent } = createService(
      {},
      jest
        .fn()
        .mockResolvedValue(
          new TextEncoder().encode(JSON.stringify({ segments: [] })),
        ),
    );

    expect(
      (await silent.get("session-1", "operator-1")).recordingUrl,
    ).toBeNull();
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

  it("assembles one recording of the whole call and keeps it", async () => {
    const utterance = encodeWav(
      toPcmBytes(new Int16Array(1_600).fill(800)),
      16_000,
    );
    const { service, mocks } = createService(
      {},
      jest.fn().mockImplementation((key: string) => {
        if (key.endsWith("manifest.json")) {
          return Promise.resolve(
            new TextEncoder().encode(JSON.stringify(manifest)),
          );
        }

        // Собранной записи ещё нет, а кусок разговора есть.
        return Promise.resolve(key.endsWith("call.wav") ? null : utterance);
      }),
    );

    const call = await service.readWholeRecording("session-1", "operator-1");

    expect(String.fromCodePoint(...call.subarray(0, 4))).toBe("RIFF");
    // Смещение 30 мс плюс 100 мс речи оператора на общей частоте 24 кГц.
    expect(call.byteLength).toBe(44 + Math.round(0.13 * 24_000) * 2);
    expect(mocks.storage.put).toHaveBeenCalledWith(
      "calls/session-1/call.wav",
      expect.anything(),
      "audio/wav",
    );
  });

  it("serves the assembled recording again without rebuilding it", async () => {
    const stored = encodeWav(toPcmBytes(new Int16Array(8).fill(1)), 24_000);
    const { service, mocks } = createService(
      {},
      jest
        .fn()
        .mockImplementation((key: string) =>
          Promise.resolve(key.endsWith("call.wav") ? stored : null),
        ),
    );

    const call = await service.readWholeRecording("session-1", "operator-1");

    expect(call).toBe(stored);
    expect(mocks.storage.put).not.toHaveBeenCalled();
  });

  it("refuses a whole recording for a call where nobody spoke", async () => {
    const { service } = createService(
      {},
      jest
        .fn()
        .mockImplementation((key: string) =>
          Promise.resolve(
            key.endsWith("manifest.json")
              ? new TextEncoder().encode(JSON.stringify({ segments: [] }))
              : null,
          ),
        ),
    );

    expect(
      await codeOf(() => service.readWholeRecording("session-1", "operator-1")),
    ).toBe(ErrorCodes.RECORDING_NOT_FOUND);
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
