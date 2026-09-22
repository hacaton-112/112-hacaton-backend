import type { DdsLessonRecord, DdsExerciseRecord } from "@/drizzle/schema";
import type { AuditLogService } from "@/modules/audit-log/audit-log.service";

import type { DdsExerciseService } from "./dds-exercise.service";
import type { DdsExerciseStore } from "../ports/dds-exercise.store.port";
import { DdsLessonService } from "./dds-lesson.service";

const LESSON_ID = "70dfbf42-ec3b-4f3d-8d98-a415bc90ded5";
const OPERATOR_ID = "9a0deaae-2cb2-4eff-8a76-986e4a953868";
const EVENT_ID = "70dfbf42-ec3b-4f3d-8d98-a415bc90ded6";
const VERSION_ID = "70dfbf42-ec3b-4f3d-8d98-a415bc90ded7";
const EXERCISE_ID = "70dfbf42-ec3b-4f3d-8d98-a415bc90ded8";

const lesson = (overrides: Partial<DdsLessonRecord> = {}): DdsLessonRecord => ({
  id: LESSON_ID,
  createdBy: "70dfbf42-ec3b-4f3d-8d98-a415bc90ded9",
  groupId: "70dfbf42-ec3b-4f3d-8d98-a415bc90deda",
  targetUserId: null,
  title: "Практика ДДС",
  categories: ["fire"],
  cardSource: "generated",
  acknowledgementNormSeconds: 45,
  passThreshold: 75,
  status: "active",
  startEventId: "70dfbf42-ec3b-4f3d-8d98-a415bc90dedb",
  finishEventId: null,
  startedAt: new Date("2026-09-22T10:00:00.000Z"),
  finishedAt: null,
  finishedBy: null,
  ...overrides,
});

const queueCard = (): DdsExerciseRecord => ({
  id: EXERCISE_ID,
  scenarioVersionId: VERSION_ID,
  operatorId: null,
  trainingAttemptId: null,
  lessonId: null,
  sourceTrainingSessionId: "source-session",
  addressedService: "dds_01",
  status: "pending",
  card: {
    scenarioCode: "S-1",
    title: "Пожар",
    summary: "Пожар в доме",
    category: "fire",
    addressText: "Учебная, 1",
    latitude: 55.7,
    longitude: 37.6,
    callerName: null,
    callerPhone: null,
    incidentType: "Пожар",
    description: "Горит квартира",
    victimsTotal: null,
    services: ["dds_01"],
  },
  acknowledgementDeadlineAt: new Date("2026-09-22T09:00:30.000Z"),
  acknowledgedAt: null,
  completedAt: null,
  lastSequence: 1,
  score: null,
  passThreshold: 75,
  passed: null,
  startEventId: "70dfbf42-ec3b-4f3d-8d98-a415bc90dedc",
  createdAt: new Date("2026-09-22T09:00:00.000Z"),
  updatedAt: new Date("2026-09-22T09:00:00.000Z"),
});

const scenarioSource = {
  scenarioVersionId: VERSION_ID,
  code: "S-1",
  title: "Пожар",
  summary: "Пожар в доме",
  category: "fire" as const,
  expectedServices: ["fire" as const],
  exactAddress: { street: "Учебная", house: "1" },
  exactLatitude: 55.7,
  exactLongitude: 37.6,
  locatorLabel: "Учебная, 1",
  callerName: "Заявитель",
  callerNumber: "+79990000000",
  referenceFields: [],
};

const createDb = (results: unknown[]) => {
  const calls: { method: string; args: unknown[] }[] = [];
  const next = () => {
    if (results.length === 0) throw new Error("Unexpected query");
    return Promise.resolve(results.shift());
  };
  const chain: object = new Proxy(
    {},
    {
      get: (_target, method: string) => {
        if (method === "then") {
          return (
            resolve: (value: unknown) => void,
            reject: (error: unknown) => void,
          ) => next().then(resolve, reject);
        }
        return (...args: unknown[]) => {
          calls.push({ method, args });
          return chain;
        };
      },
    },
  );
  const db = new Proxy(
    {},
    {
      get: (_target, method: string) => {
        if (method === "transaction") {
          return (work: (tx: unknown) => unknown) => work(db);
        }
        return (...args: unknown[]) => {
          calls.push({ method, args });
          return chain;
        };
      },
    },
  );
  return { db, calls };
};

const createService = (
  results: unknown[],
  source: typeof scenarioSource | null = scenarioSource,
) => {
  const { db, calls } = createDb(results);
  const store = { loadScenarioSource: jest.fn().mockResolvedValue(source) };
  const exercises = {
    presentByIds: jest
      .fn()
      .mockImplementation((ids: readonly string[]) =>
        Promise.resolve(
          new Map(ids.map((id) => [id, { id, status: "pending" }])),
        ),
      ),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new DdsLessonService(
    db as never,
    store as unknown as DdsExerciseStore,
    exercises as unknown as DdsExerciseService,
    audit as unknown as AuditLogService,
  );
  return { service, store, exercises, audit, calls };
};

const membership = [{ groupId: lesson().groupId, serviceTag: "01" }];

describe(`${DdsLessonService.name}.create`, () => {
  it("starts a group lesson and reports a member with an unknown service tag", async () => {
    const current = lesson();
    const { service } = createService([
      [],
      [
        {
          id: current.groupId,
          status: "active",
          instructorId: current.createdBy,
        },
      ],
      [current],
      [
        {
          userId: OPERATOR_ID,
          fullName: "Участник без службы ДДС",
          serviceTag: "RIZO",
        },
      ],
      [],
    ]);

    await expect(
      service.create(
        { id: current.createdBy, role: "instructor" },
        {
          eventId: current.startEventId,
          groupId: current.groupId!,
          title: current.title,
          categories: current.categories,
          cardSource: current.cardSource,
          acknowledgementNormSeconds: current.acknowledgementNormSeconds,
          passThreshold: current.passThreshold,
        },
      ),
    ).resolves.toMatchObject({
      participants: [],
      skippedParticipants: [
        { fullName: "Участник без службы ДДС", serviceTag: "RIZO" },
      ],
    });
  });
});

describe(`${DdsLessonService.name}.next`, () => {
  it("issues a generated card with the lesson acknowledgement norm", async () => {
    const before = Date.now();
    const { service, calls } = createService([
      [lesson()],
      membership,
      [],
      [],
      [],
      [{ id: VERSION_ID, scenarioId: "scenario-1" }],
      [],
      [],
    ]);

    await expect(
      service.next(OPERATOR_ID, LESSON_ID, EVENT_ID),
    ).resolves.toMatchObject({
      status: "ready",
      exercise: { status: "pending" },
    });

    const inserted = calls
      .filter(({ method }) => method === "values")
      .map(({ args }) => args[0])
      .find(
        (value) =>
          typeof value === "object" &&
          value !== null &&
          "acknowledgementDeadlineAt" in value,
      ) as { acknowledgementDeadlineAt: Date; lessonId: string };
    expect(inserted.lessonId).toBe(LESSON_ID);
    expect(inserted.acknowledgementDeadlineAt.getTime()).toBeGreaterThanOrEqual(
      before + 45_000,
    );
  });

  it("issues only the current version of a republished scenario", async () => {
    const current = "70dfbf42-ec3b-4f3d-8d98-a415bc90dee0";
    const { service, store, calls } = createService([
      [lesson()],
      membership,
      [],
      [],
      [],
      // Версии приходят от новой к старой, как в запросе.
      [
        { id: current, scenarioId: "scenario-1" },
        { id: VERSION_ID, scenarioId: "scenario-1" },
      ],
      [],
      [],
    ]);

    await service.next(OPERATOR_ID, LESSON_ID, EVENT_ID);

    expect(store.loadScenarioSource).toHaveBeenCalledTimes(1);
    expect(store.loadScenarioSource).toHaveBeenCalledWith(current);
    const inserted = calls
      .filter(({ method }) => method === "values")
      .map(({ args }) => args[0])
      .find(
        (value) =>
          typeof value === "object" &&
          value !== null &&
          "scenarioVersionId" in value,
      ) as { scenarioVersionId: string };
    expect(inserted.scenarioVersionId).toBe(current);
  });

  it("does not hand a service an incident of another service", async () => {
    // Сценарий пожарный, а ученик — газовая служба: такой карточки в его
    // ленте быть не должно, даже если других сценариев нет.
    const { service, calls } = createService([
      [lesson()],
      [{ groupId: lesson().groupId, serviceTag: "04" }],
      [],
      [],
      [],
      [{ id: VERSION_ID, scenarioId: "scenario-1" }],
    ]);

    await expect(
      service.next(OPERATOR_ID, LESSON_ID, EVENT_ID),
    ).resolves.toMatchObject({ status: "empty" });
    expect(calls.some(({ method }) => method === "insert")).toBe(false);
  });

  it("claims a queued operator card", async () => {
    const { service, calls } = createService([
      [lesson({ cardSource: "operator_call" })],
      membership,
      [],
      [],
      [queueCard()],
      [{ id: EXERCISE_ID }],
      [],
    ]);

    await expect(
      service.next(OPERATOR_ID, LESSON_ID, EVENT_ID),
    ).resolves.toMatchObject({
      status: "ready",
    });
    const claim = calls
      .filter(({ method }) => method === "set")
      .map(({ args }) => args[0])
      .find(
        (value) =>
          typeof value === "object" && value !== null && "lessonId" in value,
      );
    expect(claim).toMatchObject({
      lessonId: LESSON_ID,
      operatorId: OPERATOR_ID,
      startEventId: EVENT_ID,
    });
  });

  it("falls back to the other source when a mixed source is empty", async () => {
    const { service } = createService([
      [lesson({ cardSource: "mixed" })],
      membership,
      [],
      [],
      [],
      [],
      [],
      [queueCard()],
      [{ id: EXERCISE_ID }],
      [],
    ]);

    await expect(
      service.next(OPERATOR_ID, LESSON_ID, EVENT_ID),
    ).resolves.toMatchObject({
      status: "ready",
    });
  });

  it("returns an empty state instead of throwing", async () => {
    const { service } = createService([
      [lesson({ cardSource: "operator_call" })],
      membership,
      [],
      [],
      [],
    ]);

    await expect(
      service.next(OPERATOR_ID, LESSON_ID, EVENT_ID),
    ).resolves.toEqual({
      status: "empty",
      reason: expect.stringContaining("карточек"),
    });
  });

  it("returns the same card for a repeated event", async () => {
    const { service, store } = createService([
      [lesson()],
      membership,
      [{ id: EXERCISE_ID }],
    ]);

    await expect(
      service.next(OPERATOR_ID, LESSON_ID, EVENT_ID),
    ).resolves.toMatchObject({
      status: "ready",
    });
    expect(store.loadScenarioSource).not.toHaveBeenCalled();
  });

  it("resumes an unfinished card before issuing another", async () => {
    const { service, store } = createService([
      [lesson()],
      membership,
      [],
      [{ id: EXERCISE_ID }],
    ]);

    await expect(
      service.next(OPERATOR_ID, LESSON_ID, EVENT_ID),
    ).resolves.toMatchObject({
      status: "ready",
    });
    expect(store.loadScenarioSource).not.toHaveBeenCalled();
  });

  it("does not duplicate a queue card after losing the conditional claim race", async () => {
    const { service } = createService([
      [lesson({ cardSource: "operator_call" })],
      membership,
      [],
      [],
      [queueCard()],
      [],
    ]);

    await expect(
      service.next(OPERATOR_ID, LESSON_ID, EVENT_ID),
    ).resolves.toMatchObject({
      status: "empty",
    });
  });
});

describe(`${DdsLessonService.name}.finish`, () => {
  it("closes unfinished cards without an overdue score", async () => {
    const finished = lesson({
      status: "finished",
      finishEventId: EVENT_ID,
      finishedAt: new Date(),
      finishedBy: lesson().createdBy,
    });
    const open = queueCard();
    const { service, calls } = createService([
      [{ lesson: lesson() }],
      [open],
      [],
      [],
      [finished],
      [
        { userId: OPERATOR_ID, fullName: "Ученик", serviceTag: "01" },
        {
          userId: "70dfbf42-ec3b-4f3d-8d98-a415bc90dedd",
          fullName: "Участник без службы ДДС",
          serviceTag: "RIZO",
        },
      ],
      [{ id: EXERCISE_ID, operatorId: OPERATOR_ID, operatorName: "Ученик" }],
    ]);

    const result = await service.finish(
      { id: lesson().createdBy, role: "instructor" },
      LESSON_ID,
      EVENT_ID,
    );

    const closed = calls
      .filter(({ method }) => method === "set")
      .map(({ args }) => args[0])
      .find(
        (value) =>
          typeof value === "object" &&
          value !== null &&
          "status" in value &&
          value.status === "lesson_finished",
      );
    expect(closed).toMatchObject({
      status: "lesson_finished",
      score: null,
      passed: null,
    });
    expect(result.skippedParticipants).toEqual([
      expect.objectContaining({
        fullName: "Участник без службы ДДС",
        serviceTag: "RIZO",
      }),
    ]);
  });
});
