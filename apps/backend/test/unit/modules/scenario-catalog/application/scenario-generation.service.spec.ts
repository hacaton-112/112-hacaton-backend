import { ConfigService } from "@nestjs/config";

import { AppServiceUnavailableException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";
import type { ScenarioGenerationJobRecord } from "@/drizzle/schema";

import type {
  ClaimedScenarioGenerationJob,
  ScenarioGenerationRepository,
} from "@/modules/scenario-catalog/ports/scenario-generation.repository";
import type { ScenarioAuthoringService } from "@/modules/scenario-catalog/application/scenario-authoring.service";
import {
  MAX_ACTIVE_JOBS_PER_AUTHOR,
  ScenarioGenerationService,
} from "@/modules/scenario-catalog/application/scenario-generation.service";

/** Очередь в памяти с теми же правилами, что и в Postgres. */
class MemoryJobs implements ScenarioGenerationRepository {
  readonly rows: ScenarioGenerationJobRecord[] = [];

  enqueue(input: { id: string; createdBy: string; brief: string; now: Date }) {
    const job: ScenarioGenerationJobRecord = {
      id: input.id,
      createdBy: input.createdBy,
      brief: input.brief,
      status: "queued",
      attempts: 0,
      leaseToken: null,
      leaseUntil: null,
      result: null,
      errorCode: null,
      errorMessage: null,
      createdAt: new Date(input.now.getTime() + this.rows.length),
      startedAt: null,
      finishedAt: null,
      dismissedAt: null,
    };
    this.rows.push(job);
    return Promise.resolve(job);
  }

  countActive(createdBy: string) {
    return Promise.resolve(
      this.rows.filter(
        (job) =>
          job.createdBy === createdBy &&
          (job.status === "queued" || job.status === "running"),
      ).length,
    );
  }

  listByOwner(createdBy: string) {
    return Promise.resolve(
      this.rows.filter(
        (job) => job.createdBy === createdBy && !job.dismissedAt,
      ),
    );
  }

  get(id: string) {
    return Promise.resolve(this.rows.find((job) => job.id === id) ?? null);
  }

  queuePositions(jobs: readonly ScenarioGenerationJobRecord[]) {
    const queued = this.rows.filter((job) => job.status === "queued");
    return Promise.resolve(
      new Map(
        jobs.flatMap((job) => {
          const index = queued.indexOf(job);
          return index < 0 ? [] : [[job.id, index + 1] as const];
        }),
      ),
    );
  }

  claimNext(input: {
    leaseToken: string;
    leaseUntil: Date;
    maxAttempts: number;
    now: Date;
  }) {
    const job = this.rows.find(
      (row) =>
        row.attempts < input.maxAttempts &&
        (row.status === "queued" ||
          (row.status === "running" && row.leaseUntil! < input.now)),
    );
    if (!job) return Promise.resolve(null);
    Object.assign(job, {
      status: "running",
      attempts: job.attempts + 1,
      leaseToken: input.leaseToken,
      leaseUntil: input.leaseUntil,
      startedAt: input.now,
    });
    return Promise.resolve({ job, leaseToken: input.leaseToken });
  }

  complete(claimed: ClaimedScenarioGenerationJob, result: unknown, now: Date) {
    const job = this.rows.find((row) => row.id === claimed.job.id)!;
    if (job.leaseToken === claimed.leaseToken)
      Object.assign(job, { status: "done", result, finishedAt: now });
    return Promise.resolve();
  }

  fail(
    claimed: ClaimedScenarioGenerationJob,
    error: { code: string; message: string },
    now: Date,
  ) {
    const job = this.rows.find((row) => row.id === claimed.job.id)!;
    if (job.leaseToken === claimed.leaseToken)
      Object.assign(job, {
        status: "failed",
        errorCode: error.code,
        errorMessage: error.message,
        finishedAt: now,
      });
    return Promise.resolve();
  }

  failExhausted() {
    return Promise.resolve(0);
  }

  dismiss(id: string, createdBy: string, now: Date) {
    const job = this.rows.find(
      (row) => row.id === id && row.createdBy === createdBy,
    );
    if (!job || (job.status !== "done" && job.status !== "failed"))
      return Promise.resolve(false);
    job.dismissedAt = now;
    return Promise.resolve(true);
  }
}

const teacher = { id: "teacher-1", role: "instructor" as const };
const draft = { scenario: { code: "S-AI-1" }, authoringPrompt: "brief" };

/** Модель, чьи ответы тест отпускает вручную: видно, сколько идёт сразу. */
const controlledModel = () => {
  const pending: {
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }[] = [];
  const generateDraft = jest.fn(
    () =>
      new Promise((resolve, reject) => {
        pending.push({ resolve, reject });
      }),
  );
  return { generateDraft, pending };
};

const createService = (concurrency = 1) => {
  const jobs = new MemoryJobs();
  const model = controlledModel();
  const config = new ConfigService({
    SCENARIO_GENERATION_CONCURRENCY: String(concurrency),
  });
  const service = new ScenarioGenerationService(
    jobs,
    model as unknown as ScenarioAuthoringService,
    config,
  );
  return { service, jobs, model };
};

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe(ScenarioGenerationService.name, () => {
  it("answers at once and keeps the draft in the queue", async () => {
    const { service } = createService();

    const first = await service.enqueue(
      teacher,
      "Пожар в гараже во дворе дома",
    );
    const second = await service.enqueue(
      teacher,
      "Плохо с сердцем на остановке",
    );

    // Первое задание свободный слот берёт сразу, поэтому ответ застаёт его
    // в очереди или уже в работе; второе ждёт своей очереди.
    expect(["queued", "running"]).toContain(first.status);
    expect(second).toMatchObject({ status: "queued", queuePosition: 1 });
    expect(first.result).toBeNull();
  });

  it("runs no more drafts at once than the model has slots", async () => {
    const { service, model } = createService(2);

    for (const brief of ["один", "два", "три", "четыре"]) {
      await service.enqueue(
        teacher,
        `Учебный вызов номер ${brief} с описанием`,
      );
    }
    await settle();

    expect(model.generateDraft).toHaveBeenCalledTimes(2);

    model.pending[0].resolve(draft);
    await settle();
    await settle();

    // Освободившийся слот сразу забирает следующее задание.
    expect(model.generateDraft).toHaveBeenCalledTimes(3);
  });

  it("hands the finished draft back through the job", async () => {
    const { service, model } = createService();
    const job = await service.enqueue(teacher, "Пожар в гараже во дворе дома");
    await settle();

    model.pending[0].resolve(draft);
    await settle();

    await expect(service.get(teacher, job.id)).resolves.toMatchObject({
      status: "done",
      result: draft,
    });
    // В списке черновик не передаётся: таблице нужен только статус.
    expect((await service.list(teacher)).jobs[0]).toMatchObject({
      status: "done",
      result: null,
    });
  });

  it("keeps the reason when the assistant cannot produce a draft", async () => {
    const { service, model } = createService();
    const job = await service.enqueue(teacher, "Пожар в гараже во дворе дома");
    await settle();

    model.pending[0].reject(
      new AppServiceUnavailableException(
        ErrorCodes.SCENARIO_ASSISTANT_INVALID_DRAFT,
        "The assistant could not produce a valid scenario draft",
      ),
    );
    await settle();

    await expect(service.get(teacher, job.id)).resolves.toMatchObject({
      status: "failed",
      error: { code: ErrorCodes.SCENARIO_ASSISTANT_INVALID_DRAFT },
    });
  });

  it("limits how many drafts one author keeps in the queue", async () => {
    const { service } = createService();
    for (let index = 0; index < MAX_ACTIVE_JOBS_PER_AUTHOR; index += 1) {
      await service.enqueue(teacher, `Учебный вызов ${index} с описанием`);
    }

    await expect(
      service.enqueue(teacher, "Ещё один вызов сверх предела"),
    ).rejects.toMatchObject({ code: ErrorCodes.SCENARIO_GENERATION_LIMIT });
    // Другой преподаватель ставит задание как обычно.
    await expect(
      service.enqueue({ id: "teacher-2", role: "instructor" }, "Свой вызов"),
    ).resolves.toMatchObject({ status: "queued" });
  });

  it("hides another author's draft", async () => {
    const { service } = createService();
    const job = await service.enqueue(teacher, "Пожар в гараже во дворе дома");

    await expect(
      service.get({ id: "teacher-2", role: "instructor" }, job.id),
    ).rejects.toMatchObject({
      code: ErrorCodes.SCENARIO_GENERATION_JOB_NOT_FOUND,
    });
  });

  it("dismisses only a finished draft", async () => {
    const { service, model } = createService();
    const job = await service.enqueue(teacher, "Пожар в гараже во дворе дома");
    await settle();

    await expect(service.dismiss(teacher, job.id)).rejects.toBeDefined();
    model.pending[0].resolve(draft);
    await settle();
    await service.dismiss(teacher, job.id);

    expect((await service.list(teacher)).jobs).toHaveLength(0);
  });
});
