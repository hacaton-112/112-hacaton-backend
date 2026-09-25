import { createHash } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import {
  SpeechSynthesisStreamEventSchema,
  type SpeechSynthesisStreamEvent,
  type TtsSynthesisRequest,
} from "@/contracts";
import type { DrizzleService } from "@/core/database/drizzle.service";
import type { AuditLogService } from "@/modules/audit-log/application/audit-log.service";
import type { RecordingStorage } from "@/modules/call-recording/ports/recording-storage.port";
import type { ScenarioStore } from "@/modules/scenario-engine/ports/scenario-store.port";
import type { SpeechSynthesisService } from "@/modules/speech-synthesis";
import {
  audioFingerprint,
  compilePreparedSpeech,
} from "@/modules/scenario-audio/domain/prepared-dialogue";
import { ScenarioAudioService } from "@/modules/scenario-audio/application/scenario-audio.service";

const request: TtsSynthesisRequest = {
  requestId: "turn-2",
  sessionId: "session-1",
  text: "Учебная улица, дом 12.",
  language: "Russian",
  voiceId: "Vivian",
  gender: "female",
  emotion: "calm",
  intensity: 0.2,
  speechRate: 1,
};
const audio = new Uint8Array([1, 2, 3, 4]);
const asset = {
  key: "scenario-audio/v1/version-1/file.pcm",
  bytes: audio.length,
  sampleRate: 24_000,
  sha256: createHash("sha256").update(audio).digest("hex"),
};
const pack = {
  scenarioVersionId: "version-1",
  status: "ready",
  assets: { [audioFingerprint(request)]: asset },
};

const setup = (row: unknown = pack, store: Partial<ScenarioStore> = {}) => {
  const get = jest
    .fn<
      ReturnType<RecordingStorage["get"]>,
      Parameters<RecordingStorage["get"]>
    >()
    .mockResolvedValue(audio);
  const where = jest.fn().mockResolvedValue(row ? [row] : []);
  const db = {
    select: () => ({ from: () => ({ where }) }),
  } as unknown as DrizzleService["db"];
  const service = new ScenarioAudioService(
    db,
    store as ScenarioStore,
    { get, put: jest.fn() },
    {} as SpeechSynthesisService,
    new ConfigService(),
    {} as AuditLogService,
  );
  return { service, get };
};

describe(ScenarioAudioService.name, () => {
  it("requires an approved bank and opening/fallback for every panic level", async () => {
    await expect(
      setup({ ...pack, entries: [] }).service.assertOfflineReady("version-1"),
    ).rejects.toThrow("offline");
    const version = {
      id: "version-1",
      openingLine: "Помогите!",
      fallbackLine: "Повторите.",
      panicFloor: 0,
      panicCeiling: 4,
      facts: [],
      persona: {
        voiceId: "Vivian",
        gender: "female" as const,
        baseSpeechRate: 1,
      },
    };
    const requests = compilePreparedSpeech(version);
    const assets = Object.fromEntries(
      requests.map((item) => [audioFingerprint(item), asset]),
    );
    const store = { loadVersion: jest.fn().mockResolvedValue(version) };
    const row = {
      ...pack,
      entries: [
        { factKey: "place", questions: ["Где вы?"], acknowledge: false },
      ],
      assets,
    };
    await expect(
      setup(row, store).service.assertOfflineReady("version-1"),
    ).resolves.toBeUndefined();
    delete assets[audioFingerprint(requests.at(-1)!)];
    // Remove specifically the highest panic level's fallback, not an optional reaction.
    const lastFallback = requests
      .filter((item) => item.text === version.fallbackLine)
      .at(-1)!;
    delete assets[audioFingerprint(lastFallback)];
    await expect(
      setup(row, store).service.assertOfflineReady("version-1"),
    ).rejects.toThrow("offline");
  });
  it("matches approved paraphrases exactly and only to known engine facts", () => {
    const { service } = setup();
    const entries = [
      {
        factKey: "address",
        questions: ["Где это произошло?"],
        acknowledge: false,
      },
      {
        factKey: "unknown",
        questions: ["Где это произошло?"],
        acknowledge: false,
      },
    ];
    const facts = [
      { id: "address", label: "Адрес", question: "Назовите адрес?" },
    ];
    expect(
      service.resolveApprovedQuestion("ГДЕ это произошло!", facts, entries),
    ).toEqual(["address"]);
    expect(
      service.resolveApprovedQuestion(
        "Не говорите, где это произошло",
        facts,
        entries,
      ),
    ).toBeNull();
    expect(
      service.resolveApprovedQuestion("Где это произошло?", [], entries),
    ).toBeNull();
  });
  it("uses only ready audio with a matching complete fingerprint and integrity hash", async () => {
    const { service, get } = setup();
    await expect(
      service.lookup("version-1", request, new AbortController().signal),
    ).resolves.toEqual({ audio, sampleRate: 24_000 });
    expect(get).toHaveBeenCalledWith(asset.key, expect.any(AbortSignal));
    await expect(
      service.lookup(
        "version-1",
        { ...request, text: "Другая улица." },
        new AbortController().signal,
      ),
    ).resolves.toBeNull();
    // Подменённое содержимое отбраковывается при первой же сверке: у свежего
    // экземпляра проверенных записей в памяти ещё нет.
    const corrupted = setup();
    corrupted.get.mockResolvedValue(new Uint8Array([9, 9, 9, 9]));
    await expect(
      corrupted.service.lookup(
        "version-1",
        request,
        new AbortController().signal,
      ),
    ).resolves.toBeNull();
  });

  it("verifies a prepared record once and keeps it for the next reply", async () => {
    const { service, get } = setup();

    await service.lookup("version-1", request, new AbortController().signal);
    await service.lookup("version-1", request, new AbortController().signal);

    // Загрузка и сверка хеша стоят дорого, а ключ содержит sha256: содержимое
    // по нему уже не изменится.
    expect(get).toHaveBeenCalledTimes(1);
  });
  it.each([null, { ...pack, status: "preparing" }])(
    "does not expose incomplete packs",
    async (row) => {
      const { service, get } = setup(row);
      await expect(
        service.lookup("version-1", request, new AbortController().signal),
      ).resolves.toBeNull();
      expect(get).not.toHaveBeenCalled();
    },
  );
  it("treats missing storage as a miss but propagates call cancellation", async () => {
    const { service, get } = setup();
    get.mockRejectedValue(new Error("Unavailable"));
    await expect(
      service.lookup("version-1", request, new AbortController().signal),
    ).resolves.toBeNull();
    await expect(
      service.lookup("version-1", request, AbortSignal.abort()),
    ).rejects.toThrow();
  });
  it("replays through the ordinary validated PCM protocol and stops on barge-in", async () => {
    const { service } = setup();
    const events: SpeechSynthesisStreamEvent[] = [];
    for await (const event of service.replay(
      { audio: new Uint8Array(10_000), sampleRate: 24_000 },
      "new-turn",
      new AbortController().signal,
    )) {
      events.push(SpeechSynthesisStreamEventSchema.parse(event));
    }
    expect(events).toHaveLength(4);
    expect(events[0]).toMatchObject({
      type: "audio.chunk",
      chunk: { streamId: "new-turn", sequence: 0, isFinal: false },
    });
    expect(events[2]).toMatchObject({
      type: "audio.chunk",
      chunk: { sequence: 2, isFinal: true },
    });
    expect(events[3]).toMatchObject({
      type: "synthesis.completed",
      metrics: { source: "prepared", attempts: [] },
    });
    const abort = new AbortController();
    const stream = service.replay(
      { audio: new Uint8Array(10_000), sampleRate: 24_000 },
      "cancelled-turn",
      abort.signal,
    );
    const iterator = stream[Symbol.asyncIterator]();
    await iterator.next();
    abort.abort();
    await expect(iterator.next()).rejects.toThrow();
  });
});
