import { ConfigService } from "@nestjs/config";
import type {
  SpeechSynthesisStreamEvent,
  TtsSynthesisRequest,
} from "@/contracts";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { scenarioAudioPacks } from "@/drizzle/schema";
import type { AuditLogService } from "@/modules/audit-log/audit-log.service";
import type {
  ScenarioStore,
  ScenarioVersionSnapshot,
} from "@/modules/scenario-engine/ports/scenario-store.port";
import type { SpeechSynthesisService } from "@/modules/speech-synthesis";
import { ScenarioAudioService } from "./scenario-audio.service";

type Pack = typeof scenarioAudioPacks.$inferSelect;
const version: ScenarioVersionSnapshot = {
  id: "version-1",
  scenarioCode: "test",
  title: "Учебный звонок",
  category: "other",
  difficulty: 1,
  isPublished: true,
  panicFloor: 0,
  panicCeiling: 0,
  maxInterruptions: 1,
  initiativeCooldownSeconds: 12,
  answerNormSeconds: 60,
  passThreshold: 75,
  expectedServices: ["ambulance"],
  openingLine: "Помогите, пожалуйста!",
  fallbackLine: "Я не знаю.",
  persona: {
    displayName: "Учебный заявитель",
    gender: "female",
    ageYears: 30,
    condition: "Волнуется",
    speechStyle: "Кратко",
    backgroundSounds: null,
    voiceId: "Vivian",
    baselinePanicLevel: 0,
    baseSpeechRate: 1,
  },
  facts: [],
  escalationRules: [],
  mandatoryQuestions: [],
  locator: null,
};
const emptyPack = (): Pack => ({
  scenarioVersionId: version.id,
  status: "queued",
  completed: 0,
  total: 0,
  assets: {},
  leaseToken: null,
  leaseUntil: null,
  updatedAt: new Date(),
});

function* events(
  request: TtsSynthesisRequest,
): Generator<SpeechSynthesisStreamEvent> {
  yield {
    type: "audio.chunk",
    chunk: {
      streamId: request.requestId,
      sequence: 0,
      sampleRate: 24_000,
      format: "pcm_s16le",
      channels: 1,
      isFinal: true,
      audio: new Uint8Array([1, 2]),
    },
  };
  yield {
    type: "synthesis.completed",
    metrics: {
      timeToFirstAudioMs: 0,
      durationMs: 1,
      chunkCount: 1,
      audioBytes: 2,
      attempts: [{ attempt: 1, durationMs: 1, outcome: "success" }],
    },
  };
}

const chain = (result: unknown) => {
  const query: Record<string, unknown> = {};
  for (const method of ["from", "where", "orderBy", "limit", "for"])
    query[method] = () => query;
  query.then = (
    resolve: (value: unknown) => unknown,
    reject: (error: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return query;
};

const setup = (pack = emptyPack(), rows: unknown[] = [[], [], [pack]]) => {
  const updates: Partial<Pack>[] = [];
  const tx = {
    execute: jest.fn().mockResolvedValue(undefined),
    select: () => chain(rows.shift() ?? []),
    update: () => ({
      set: (patch: Partial<Pack>) => ({
        where: () => {
          updates.push(patch);
          return {
            ...chain(undefined),
            returning: () => Promise.resolve([{ ...pack, ...patch }]),
          };
        },
      }),
    }),
  };
  const db = {
    ...tx,
    transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  };
  const synthesize = jest.fn(
    (
      _request: TtsSynthesisRequest,
      _signal: AbortSignal,
    ): AsyncIterable<SpeechSynthesisStreamEvent> =>
      (async function* () {
        yield* events(_request);
      })(),
  );
  const put = jest.fn().mockResolvedValue(undefined);
  const service = new ScenarioAudioService(
    db as unknown as DrizzleService["db"],
    { loadVersion: async () => version } as unknown as ScenarioStore,
    { get: jest.fn(), put },
    { synthesize } as unknown as SpeechSynthesisService,
    new ConfigService(),
    {} as AuditLogService,
  );
  return { service, synthesize, put, updates };
};

describe("durable scenario audio worker", () => {
  it("persists one complete asset and resumes the next one after a worker restart", async () => {
    const first = setup();
    await first.service.tick();
    expect(first.synthesize).toHaveBeenCalledTimes(1);
    expect(first.put).toHaveBeenCalledWith(
      expect.stringMatching(
        /^scenario-audio\/v1\/version-1\/[a-f0-9]{64}\/[a-f0-9]{64}\.pcm$/,
      ),
      new Uint8Array([1, 2]),
      "application/octet-stream",
    );
    const saved = first.updates.at(-1)!;
    expect(saved).toMatchObject({
      status: "queued",
      completed: 1,
      total: 7,
      leaseToken: null,
      leaseUntil: null,
    });
    const restarted = setup({ ...emptyPack(), ...saved });
    await restarted.service.tick();
    expect(restarted.synthesize.mock.calls[0]![0].text).not.toBe(
      first.synthesize.mock.calls[0]![0].text,
    );
    expect(restarted.updates.at(-1)).toMatchObject({
      completed: 2,
      status: "queued",
    });
  });

  it("does not publish truncated synthesis and preserves progress for explicit retry", async () => {
    const runtime = setup();
    runtime.synthesize.mockImplementation(() =>
      (async function* () {
        throw new Error("TTS unavailable");
        yield* [];
      })(),
    );
    await runtime.service.tick();
    expect(runtime.put).not.toHaveBeenCalled();
    expect(runtime.updates.at(-1)).toMatchObject({
      status: "failed",
      leaseToken: null,
    });
    expect(runtime.updates.at(-1)).not.toHaveProperty("assets");
  });

  it.each([[[{ id: "another-worker-lease" }]], [[], [{ id: "live-session" }]]])(
    "defers work for an active lease or live call",
    async (...rows) => {
      const runtime = setup(emptyPack(), rows);
      await runtime.service.tick();
      expect(runtime.synthesize).not.toHaveBeenCalled();
      expect(runtime.put).not.toHaveBeenCalled();
      expect(runtime.updates).toHaveLength(0);
    },
  );
});
