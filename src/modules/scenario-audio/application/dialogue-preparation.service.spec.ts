import { readFileSync } from "node:fs";
import { ConfigService } from "@nestjs/config";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { dialoguePreparations } from "@/drizzle/schema";
import type { AuditLogService } from "@/modules/audit-log/application/audit-log.service";
import type { StructuredOutputPort } from "@/modules/ai-gateway/ports/structured-output.port";
import type { SpeechSynthesisService } from "@/modules/speech-synthesis";
import { ScenarioSeedSchema } from "@/modules/scenario-engine/domain/scenario-seed.schema";
import { initialEntries, preparationHash } from "../domain/dialogue-preparation";
import { DialoguePreparationService } from "./dialogue-preparation.service";
import { DialoguePreparationWorker } from "./dialogue-preparation.worker";

type Job = typeof dialoguePreparations.$inferSelect;
const makeJob = (): Job => {
  const snapshot = ScenarioSeedSchema.parse(
    JSON.parse(
      readFileSync("drizzle/seed/scenarios/s-015-fire-apartment.json", "utf8"),
    ),
  );
  return {
    id: "e9523834-f28a-4b32-adfd-693743fd3123",
    ownerId: "teacher",
    snapshot,
    authoringSource: "manual",
    authoringPrompt: null,
    snapshotHash: preparationHash(snapshot),
    revision: 1,
    status: "queued",
    entries: [],
    assets: {},
    completed: 0,
    total: 0,
    attempts: 0,
    approvedAt: null,
    leaseToken: null,
    leaseUntil: null,
    error: null,
    scenarioVersionId: null,
    updatedAt: new Date(),
  };
};
const chain = (result: unknown) => {
  const query: Record<string, unknown> = {};
  for (const method of ["from", "where", "orderBy", "limit", "for"])
    query[method] = () => query;
  query.then = (
    resolve: (data: unknown) => unknown,
    reject: (error: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  query.catch = (reject: (error: unknown) => unknown) =>
    Promise.resolve(result).catch(reject);
  return query;
};
const setup = (job = makeJob(), selects: unknown[] = [[], [], [], [job]]) => {
  const updates: Partial<Job>[] = [];
  const where: unknown[] = [];
  let rejectWrite = false;
  const tx = {
    execute: jest.fn().mockResolvedValue(undefined),
    select: () => chain(selects.shift() ?? []),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: async () => [] }),
      }),
    }),
    update: () => ({
      set: (patch: Partial<Job>) => ({
        where: (condition: unknown) => {
          if (Object.keys(patch).length > 2) updates.push(patch);
          where.push(condition);
          return {
            ...chain(undefined),
            returning: async () => (rejectWrite ? [] : [{ ...job, ...patch }]),
          };
        },
      }),
    }),
  };
  const db = {
    ...tx,
    transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  };
  const complete = jest.fn().mockResolvedValue({
    questions: ["Подскажите, какой адрес происшествия?"],
  });
  const synthesize = jest.fn(() =>
    (async function* () {
      yield {
        type: "audio.chunk",
        chunk: { sampleRate: 24000, audio: new Uint8Array([1, 2]) },
      };
      yield { type: "synthesis.completed" };
    })(),
  );
  const storage = {
    get: jest.fn(),
    put: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new DialoguePreparationService(
    db as unknown as DrizzleService["db"],
    storage,
    new ConfigService(),
    audit as unknown as AuditLogService,
  );
  const worker = new DialoguePreparationWorker(
    db as unknown as DrizzleService["db"],
    storage,
    { synthesize } as unknown as SpeechSynthesisService,
    { complete } as unknown as StructuredOutputPort,
  );
  return {
    service,
    worker,
    complete,
    synthesize,
    storage,
    audit,
    updates,
    where,
    rejectWrite: () => {
      rejectWrite = true;
    },
  };
};

describe("dialogue preparation worker and instructor commands", () => {
  it("reattaches duplicate snapshot commands instead of scheduling duplicate work", async () => {
    const job = makeJob();
    const runtime = setup(job, [[job], [job]]);
    const first = await runtime.service.create(job.ownerId, job.snapshot, true);
    const duplicate = await runtime.service.create(
      job.ownerId,
      job.snapshot,
      true,
    );
    expect(first.id).toBe(duplicate.id);
    expect(first.snapshotHash).toBe(job.snapshotHash);
    expect(runtime.audit.log).not.toHaveBeenCalled();
    expect(runtime.updates).toHaveLength(0);
  });
  it("does not retain incomplete synthesized audio or call it ready", async () => {
    const job = {
      ...makeJob(),
      status: "synthesizing" as const,
      approvedAt: new Date(),
    };
    const runtime = setup(job);
    runtime.synthesize.mockImplementation(() =>
      (async function* () {
        yield {
          type: "audio.chunk",
          chunk: { sampleRate: 24000, audio: new Uint8Array([1, 2]) },
        };
      })(),
    );
    await runtime.worker.tick(new AbortController().signal);
    expect(runtime.storage.put).not.toHaveBeenCalled();
    expect(runtime.updates.at(-1)).toMatchObject({
      status: "failed",
      error: "synthesis_failed",
    });
  });
  it("checkpoints one proposal without passing facts or geodata to AI", async () => {
    const job = makeJob();
    // Put a fact with a mandatory question first.
    const key = job.snapshot.mandatoryQuestions[0].satisfiedByFactKeys[0];
    job.snapshot.facts.sort(
      (a, b) => Number(b.key === key) - Number(a.key === key),
    );
    const runtime = setup(job);
    await runtime.worker.tick(new AbortController().signal);
    expect(runtime.complete).toHaveBeenCalledTimes(1);
    const request = runtime.complete.mock.calls[0][0];
    expect(request.userPrompt).not.toContain(job.snapshot.facts[0].promptValue);
    expect(request.userPrompt).not.toContain("exactPoint");
    expect(runtime.updates.at(-1)).toMatchObject({
      status: "queued",
      attempts: 0,
      leaseToken: null,
      entries: [expect.objectContaining({ factKey: key })],
    });
    expect(runtime.synthesize).not.toHaveBeenCalled();
  });
  it("uses manual review after the bounded failed generation attempts", async () => {
    const job = { ...makeJob(), attempts: 2 };
    const runtime = setup(job);
    await runtime.worker.tick(new AbortController().signal);
    expect(runtime.complete).not.toHaveBeenCalled();
    expect(runtime.updates.at(-1)).toMatchObject({
      status: "review",
      error: "generation_failed",
      entries: initialEntries(job.snapshot),
    });
  });
  it.each([
    [[{ id: "pack-lease" }]],
    [[], [{ id: "draft-lease" }]],
    [[], [], [{ id: "live-call" }]],
  ])("defers for other workers and live conversations", async (...rows) => {
    const runtime = setup(makeJob(), rows);
    expect(await runtime.worker.tick(new AbortController().signal)).toBe(false);
    expect(runtime.synthesize).not.toHaveBeenCalled();
    expect(runtime.complete).not.toHaveBeenCalled();
  });
  it("resumes audio from checkpoint after restart and retains previous assets", async () => {
    const job = {
      ...makeJob(),
      status: "synthesizing" as const,
      approvedAt: new Date(),
    };
    const first = setup(job);
    await first.worker.tick(new AbortController().signal);
    expect(first.updates.at(-1)).toMatchObject({
      status: "synthesizing",
      completed: 1,
    });
    const restarted = setup({ ...job, ...first.updates.at(-1) });
    await restarted.worker.tick(new AbortController().signal);
    expect(restarted.updates.at(-1)).toMatchObject({ completed: 2 });
    expect(restarted.storage.put.mock.calls[0][0]).not.toBe(
      first.storage.put.mock.calls[0][0],
    );
  });
  it("requires ownership to load a job or preview", async () => {
    const runtime = setup(makeJob(), [[], []]);
    await expect(runtime.service.status("id", "stranger")).rejects.toThrow(
      "Preparation not found",
    );
    await expect(runtime.service.preview("id", "stranger", 0)).rejects.toThrow(
      "Preparation not found",
    );
  });
  it("rejects a stale edit and never audits a successful approval", async () => {
    const job = makeJob();
    job.status = "review";
    job.entries = initialEntries(job.snapshot);
    const runtime = setup(job, [[job]]);
    runtime.rejectWrite();
    await expect(
      runtime.service.approve(job.id, job.ownerId, 0),
    ).rejects.toThrow("revision has changed");
    expect(runtime.audit.log).not.toHaveBeenCalled();
  });
  it("cannot reopen a published preparation", async () => {
    const job = {
      ...makeJob(),
      status: "published" as const,
      scenarioVersionId: "version",
    };
    const runtime = setup(job, [[job]]);
    await expect(
      runtime.service.reopen(job.id, job.ownerId, 1),
    ).rejects.toThrow("state has changed");
    expect(runtime.updates).toHaveLength(0);
  });
});
