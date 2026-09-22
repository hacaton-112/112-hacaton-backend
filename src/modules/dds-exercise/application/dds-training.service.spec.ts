import type { AuditLogService } from "@/modules/audit-log/audit-log.service";

import type { DdsExerciseService } from "./dds-exercise.service";
import { DdsTrainingService } from "./dds-training.service";

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
      get:
        (_target, method: string) =>
        (...args: unknown[]) => {
          calls.push({ method, args });
          return chain;
        },
    },
  );
  return { db, calls };
};

const createService = (
  results: unknown[],
  exercisesById: Map<string, { id: string }>,
) => {
  const { db, calls } = createDb(results);
  const exercises = {
    presentByIds: jest.fn().mockResolvedValue(exercisesById),
  };
  const service = new DdsTrainingService(
    db as never,
    {} as never,
    exercises as unknown as DdsExerciseService,
    { log: jest.fn() } as unknown as AuditLogService,
    false,
  );
  return { service, exercises, calls };
};

describe(`${DdsTrainingService.name}.list`, () => {
  it("returns assigned attempts and completed standalone cards separately", async () => {
    const assigned = {
      id: "assigned-exercise",
      operatorId: "operator-1",
      assignmentId: "assignment-1",
      assignmentTitle: "Назначенная карточка",
      operatorName: "Анна Оператор",
      attemptNumber: 2,
      attemptStatus: "completed" as const,
      passThreshold: 75,
    };
    const standalone = {
      id: "standalone-exercise",
      operatorId: "operator-2",
      operatorName: "Иван Диспетчер",
      passThreshold: 75,
    };
    const { service, exercises } = createService(
      [[assigned], [standalone], []],
      new Map([
        [assigned.id, { id: assigned.id }],
        [standalone.id, { id: standalone.id }],
      ]),
    );

    const result = await service.list({ id: "admin-1", role: "admin" });

    expect(exercises.presentByIds).toHaveBeenCalledWith([
      assigned.id,
      standalone.id,
    ]);
    expect(result.attempts).toEqual([
      expect.objectContaining({
        assignmentId: assigned.assignmentId,
        exercise: { id: assigned.id },
        reviews: [],
      }),
    ]);
    expect(result.standaloneResults).toEqual([
      expect.objectContaining({
        operatorId: standalone.operatorId,
        exercise: { id: standalone.id },
      }),
    ]);
  });

  it("does not invent standalone results when none are visible to an instructor", async () => {
    const { service, exercises, calls } = createService(
      [[], [], []],
      new Map(),
    );

    await expect(
      service.list({ id: "instructor-1", role: "instructor" }),
    ).resolves.toEqual({ attempts: [], standaloneResults: [] });
    expect(exercises.presentByIds).toHaveBeenCalledWith([]);
    expect(calls.some(({ method }) => method === "innerJoin")).toBe(true);
  });
});
