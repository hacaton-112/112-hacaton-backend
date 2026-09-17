import type { AppException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";
import type { TrainingAssignmentRecord } from "@/drizzle/schema";
import type { AuditLogService } from "@/modules/audit-log/audit-log.service";
import type { ScenarioEngineService } from "@/modules/scenario-engine";

import {
  attemptBlocker,
  isAssignedToOperator,
  summarizeStudentCalls,
  TrainingService,
  transitionAssignment,
} from "./training.service";

const NOW = new Date("2026-09-15T12:00:00.000Z");

const assignment = (
  overrides: Partial<TrainingAssignmentRecord> = {},
): TrainingAssignmentRecord => ({
  id: "assignment-1",
  title: "Пожар в жилом доме",
  scenarioVersionId: "version-1",
  groupId: "group-1",
  targetUserId: null,
  type: "voice_call",
  cardSource: "generated",
  serviceTag: null,
  answerNormSeconds: 240,
  passThreshold: 75,
  maxAttempts: 3,
  dueDate: null,
  status: "in_progress",
  createdBy: "instructor-1",
  launchedAt: NOW,
  completedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

/**
 * Запрос Drizzle — цепочка методов, которая в конце ожидается как промис.
 * Каждый `await` забирает следующий заранее заданный результат.
 */
const createDb = (results: unknown[]) => {
  const calls: { method: string; args: unknown[] }[] = [];
  const next = () => {
    if (results.length === 0) throw new Error("Unexpected query");
    const result = results.shift();
    return result instanceof Error
      ? Promise.reject(result)
      : Promise.resolve(result);
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
          return async (run: (tx: unknown) => Promise<unknown>) => run(chain);
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
  engine: Partial<ScenarioEngineService> = {},
) => {
  const { db, calls } = createDb(results);
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new TrainingService(
    db as never,
    audit as unknown as AuditLogService,
    engine as ScenarioEngineService,
  );
  return { service, calls, audit };
};

const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as AppException;
  }
  throw new Error("Expected the call to be rejected");
};

describe("transitionAssignment", () => {
  it("launches only a draft and completes only a running assignment", () => {
    expect(transitionAssignment("draft", "launch")).toBe("in_progress");
    expect(transitionAssignment("in_progress", "complete")).toBe("completed");
    expect(() => transitionAssignment("completed", "launch")).toThrow();
    expect(() => transitionAssignment("draft", "complete")).toThrow();
  });

  it("archives drafts and finished assignments but never a running one", () => {
    expect(transitionAssignment("draft", "archive")).toBe("archived");
    expect(transitionAssignment("completed", "archive")).toBe("archived");
    expect(() => transitionAssignment("in_progress", "archive")).toThrow();
    expect(() => transitionAssignment("archived", "archive")).toThrow();
  });

  it("edits and deletes only drafts", () => {
    expect(transitionAssignment("draft", "update")).toBeNull();
    expect(transitionAssignment("draft", "delete")).toBeNull();
    for (const status of ["in_progress", "completed", "archived"] as const) {
      expect(() => transitionAssignment(status, "update")).toThrow();
      expect(() => transitionAssignment(status, "delete")).toThrow();
    }
  });
});

describe("isAssignedToOperator", () => {
  const member = { groupId: "group-1", serviceTag: "FIRE_101" };

  it("shows a group assignment to its members only", () => {
    expect(isAssignedToOperator(assignment(), "operator-1", [member])).toBe(
      true,
    );
    expect(isAssignedToOperator(assignment(), "operator-1", [])).toBe(false);
    expect(
      isAssignedToOperator(assignment({ groupId: "group-2" }), "operator-1", [
        member,
      ]),
    ).toBe(false);
  });

  it("narrows a group assignment to the operator's service", () => {
    expect(
      isAssignedToOperator(
        assignment({ serviceTag: "fire_101" }),
        "operator-1",
        [member],
      ),
    ).toBe(true);
    expect(
      isAssignedToOperator(
        assignment({ serviceTag: "MED_103" }),
        "operator-1",
        [member],
      ),
    ).toBe(false);
  });

  it("shows an individual assignment only to its target", () => {
    const individual = assignment({
      groupId: null,
      targetUserId: "operator-1",
      serviceTag: "MED_103",
    });
    expect(isAssignedToOperator(individual, "operator-1", [])).toBe(true);
    expect(isAssignedToOperator(individual, "operator-2", [member])).toBe(
      false,
    );
  });
});

describe("summarizeStudentCalls", () => {
  const call = (
    overrides: Partial<Parameters<typeof summarizeStudentCalls>[0][number]>,
  ) => ({
    offeredAt: "2026-09-15T10:00:00.000Z",
    answeredAt: "2026-09-15T10:00:10.000Z",
    attemptStatus: "completed" as const,
    score: 80,
    passThreshold: 75,
    ...overrides,
  });

  it("averages only evaluated calls and counts passes by the assignment threshold", () => {
    expect(
      summarizeStudentCalls([
        call({ score: 80 }),
        call({
          score: 60,
          offeredAt: "2026-09-16T10:00:00.000Z",
          answeredAt: "2026-09-16T10:00:20.000Z",
        }),
        call({ score: null, attemptStatus: "abandoned", answeredAt: null }),
      ]),
    ).toEqual({
      attempts: 3,
      completedAttempts: 2,
      evaluatedCalls: 2,
      passedCalls: 1,
      averageScore: 70,
      bestScore: 80,
      averageAnswerSeconds: 15,
      lastAttemptAt: "2026-09-16T10:00:00.000Z",
    });
  });

  it("reports nothing for a student without attempts", () => {
    expect(summarizeStudentCalls([])).toEqual({
      attempts: 0,
      completedAttempts: 0,
      evaluatedCalls: 0,
      passedCalls: 0,
      averageScore: null,
      bestScore: null,
      averageAnswerSeconds: null,
      lastAttemptAt: null,
    });
  });
});

describe("attemptBlocker", () => {
  it("allows an attempt while the lesson runs and attempts remain", () => {
    expect(attemptBlocker(assignment(), 2, NOW)).toBeNull();
    expect(
      attemptBlocker(assignment({ maxAttempts: null }), 99, NOW),
    ).toBeNull();
  });

  it("reports the exhausted limit separately from an unavailable lesson", () => {
    expect(attemptBlocker(assignment(), 3, NOW)).toBe(
      ErrorCodes.ASSIGNMENT_MAX_ATTEMPTS_REACHED,
    );
    expect(attemptBlocker(assignment({ status: "completed" }), 0, NOW)).toBe(
      ErrorCodes.ASSIGNMENT_NOT_AVAILABLE,
    );
    expect(
      attemptBlocker(
        assignment({ dueDate: new Date("2026-09-15T11:59:59.000Z") }),
        0,
        NOW,
      ),
    ).toBe(ErrorCodes.ASSIGNMENT_NOT_AVAILABLE);
  });
});

describe(TrainingService.name, () => {
  const reserve = {
    assignmentId: "assignment-1",
    operatorId: "operator-1",
    scenarioVersionId: "version-1",
    trainingSessionId: "session-1",
  };
  const membership = [{ groupId: "group-1", serviceTag: "FIRE_101" }];

  it("returns the group and scenario context for live monitoring", async () => {
    const startedAt = new Date("2026-09-15T11:59:00.000Z");
    const getSnapshot = jest.fn().mockResolvedValue({
      checklistSatisfied: 2,
      checklistTotal: 5,
    });
    const { service } = createService(
      [
        [
          {
            trainingSessionId: "session-1",
            assignmentId: "assignment-1",
            assignmentTitle: "Пожар в жилом доме",
            groupId: "group-1",
            groupName: "Смена А",
            scenarioCode: "FIRE-01",
            scenarioTitle: "Пожар в жилом доме",
            operatorId: "operator-1",
            operatorName: "Анна Оператор",
            attemptStatus: "active",
            stage: "conversation",
            panicLevel: 3,
            startedAt,
          },
        ],
      ],
      { getSnapshot },
    );

    await expect(
      service.listLiveSessions(
        { id: "instructor-1", role: "instructor" },
        "group-1",
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        groupName: "Смена А",
        scenarioCode: "FIRE-01",
        scenarioTitle: "Пожар в жилом доме",
        checklistSatisfied: 2,
        checklistTotal: 5,
        startedAt: startedAt.toISOString(),
      }),
    ]);
    expect(getSnapshot).toHaveBeenCalledWith("session-1");
  });

  describe("reserveAttempt", () => {
    it("numbers the attempt after the operator's previous ones under a row lock", async () => {
      const { service, calls } = createService([
        undefined,
        membership,
        [assignment()],
        [{ status: "completed" }, { status: "abandoned" }],
        undefined,
      ]);

      await expect(service.reserveAttempt(reserve)).resolves.toBe(3);
      expect(calls.some(({ method }) => method === "for")).toBe(true);
      expect(calls.find(({ method }) => method === "values")?.args[0]).toEqual(
        expect.objectContaining({
          attemptNumber: 3,
          status: "offered",
          trainingSessionId: "session-1",
        }),
      );
    });

    it("rejects an exhausted limit with its own code", async () => {
      const { service } = createService([
        undefined,
        membership,
        [assignment({ maxAttempts: 2 })],
        [{ status: "completed" }, { status: "declined" }],
      ]);

      const error = await rejection(service.reserveAttempt(reserve));
      expect(error.code).toBe(ErrorCodes.ASSIGNMENT_MAX_ATTEMPTS_REACHED);
    });

    it("hides an assignment of another service", async () => {
      const { service } = createService([
        undefined,
        membership,
        [assignment({ serviceTag: "MED_103" })],
      ]);

      const error = await rejection(service.reserveAttempt(reserve));
      expect(error.code).toBe(ErrorCodes.ASSIGNMENT_NOT_AVAILABLE);
    });

    it("rejects a scenario version that differs from the assignment", async () => {
      const { service } = createService([
        undefined,
        membership,
        [assignment({ scenarioVersionId: "version-2" })],
      ]);

      const error = await rejection(service.reserveAttempt(reserve));
      expect(error.code).toBe(ErrorCodes.ASSIGNMENT_NOT_AVAILABLE);
    });

    it("turns a concurrent second active attempt into a conflict", async () => {
      const uniqueViolation = Object.assign(new Error("insert failed"), {
        cause: { code: "23505" },
      });
      const { service } = createService([
        undefined,
        membership,
        [assignment()],
        [],
        uniqueViolation,
      ]);

      const error = await rejection(service.reserveAttempt(reserve));
      expect(error.code).toBe(ErrorCodes.ASSIGNMENT_ATTEMPT_ACTIVE);
    });
  });

  it("closes attempts left behind by calls that already ended before reserving", async () => {
    const { service, calls } = createService([
      undefined,
      membership,
      [assignment()],
      [],
      undefined,
    ]);

    await service.reserveAttempt(reserve);

    const firstSet = calls.find(({ method }) => method === "set");
    expect(firstSet?.args[0]).toEqual(
      expect.objectContaining({ status: "abandoned" }),
    );
    expect(calls.findIndex(({ method }) => method === "set")).toBeLessThan(
      calls.findIndex(({ method }) => method === "values"),
    );
  });

  describe("finishAttempt", () => {
    it("reports whether an active attempt was closed", async () => {
      const { service } = createService([[{ id: "attempt-1" }], []]);

      await expect(
        service.finishAttempt("session-1", "cancelled_by_instructor"),
      ).resolves.toBe(true);
      // Уже закрытая попытка не перезаписывается «брошенной».
      await expect(
        service.finishAttempt("session-1", "abandoned"),
      ).resolves.toBe(false);
    });
  });

  describe("requireManagedSession", () => {
    const row = {
      operatorId: "operator-1",
      attemptStatus: "active",
      createdBy: "admin-1",
      groupInstructorId: "instructor-1",
    };

    it("lets the group's instructor in even when an admin created the assignment", async () => {
      const { service } = createService([[row]]);

      await expect(
        service.requireManagedSession(
          { id: "instructor-1", role: "instructor" },
          "session-1",
        ),
      ).resolves.toEqual({ operatorId: "operator-1", attemptStatus: "active" });
    });

    it("hides another instructor's session as missing", async () => {
      const { service } = createService([[row]]);

      const error = await rejection(
        service.requireManagedSession(
          { id: "instructor-2", role: "instructor" },
          "session-1",
        ),
      );
      expect(error.code).toBe(ErrorCodes.CALL_NOT_FOUND);
    });

    it("gives an admin a free call outside assignments", async () => {
      const { service } = createService([[], [{ operatorId: "operator-9" }]]);

      await expect(
        service.requireManagedSession({ id: "admin-1", role: "admin" }, "s"),
      ).resolves.toEqual({ operatorId: "operator-9", attemptStatus: null });
    });
  });

  describe("assignment lifecycle", () => {
    const admin = { id: "admin-1", role: "admin" } as const;
    const instructor = { id: "instructor-1", role: "instructor" } as const;
    const managed = (overrides: Partial<TrainingAssignmentRecord> = {}) => [
      { assignment: assignment(overrides), groupInstructorId: "instructor-1" },
    ];

    it("refuses to edit a running assignment", async () => {
      const { service } = createService([managed()]);

      const error = await rejection(
        service.updateAssignment(instructor, "assignment-1", {
          title: "Новое",
        }),
      );
      expect(error.code).toBe(ErrorCodes.ASSIGNMENT_STATE_INVALID);
    });

    it("refuses to complete a lesson with an active attempt", async () => {
      const { service } = createService([
        managed(),
        undefined,
        [{ id: "assignment-1" }],
        [{ id: "attempt-1" }],
      ]);

      const error = await rejection(
        service.completeAssignmentById(instructor, "assignment-1"),
      );
      expect(error.code).toBe(ErrorCodes.ASSIGNMENT_HAS_ACTIVE_ATTEMPTS);
    });

    it("deletes a draft and records it in the audit log", async () => {
      const { service, audit } = createService([
        managed({ status: "draft" }),
        undefined,
      ]);

      await service.deleteAssignment(instructor, "assignment-1");
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "training.assignment.deleted" }),
      );
    });

    it("forbids managing an assignment of a foreign group", async () => {
      const { service } = createService([
        [
          {
            assignment: assignment({ createdBy: "instructor-2" }),
            groupInstructorId: "instructor-2",
          },
        ],
      ]);

      const error = await rejection(
        service.archiveAssignmentById(instructor, "assignment-1"),
      );
      expect(error.code).toBe(ErrorCodes.AUTH_ROLE_FORBIDDEN);
    });

    it("changes a student's service and rejects a student outside the group", async () => {
      const group = [
        { id: "group-1", instructorId: "instructor-1", status: "active" },
      ];
      const { service, audit } = createService([
        group,
        [{ id: "member-1" }],
        group,
        [],
      ]);

      await service.updateMember(instructor, "group-1", "operator-1", {
        serviceTag: "MED_103",
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "training.group.member_updated" }),
      );

      const error = await rejection(
        service.updateMember(instructor, "group-1", "operator-9", {
          serviceTag: "MED_103",
        }),
      );
      expect(error.code).toBe(ErrorCodes.GROUP_MEMBER_NOT_FOUND);
    });

    it("lets only an administrator hand a group to another instructor", async () => {
      const group = [
        { id: "group-1", instructorId: "instructor-1", status: "active" },
      ];
      const { service } = createService([group]);

      const error = await rejection(
        service.updateGroup(instructor, "group-1", {
          instructorId: "instructor-2",
        }),
      );
      expect(error.code).toBe(ErrorCodes.AUTH_ROLE_FORBIDDEN);
    });

    it("lets an administrator assign a group instructor on creation", async () => {
      const { service, calls, audit } = createService([
        [], // duplicate check: no existing group with code
        [{ id: "instructor-2" }], // active instructor lookup
        [
          {
            id: "group-new",
            name: "Поток 2",
            code: "GRP-02",
            organization: "ГБУ 112",
            instructorId: "instructor-2",
            status: "active",
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
      ]);

      const created = await service.createGroup(admin, {
        name: "Поток 2",
        code: "GRP-02",
        organization: "ГБУ 112",
        instructorId: "instructor-2",
      });

      expect(created.instructorId).toBe("instructor-2");
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "training.group.created",
          resourceId: "group-new",
        }),
      );
    });

    it("forbids non-admin from assigning a group to another instructor on creation", async () => {
      const { service } = createService([[]]);

      const error = await rejection(
        service.createGroup(instructor, {
          name: "Поток 2",
          code: "GRP-02",
          organization: "ГБУ 112",
          instructorId: "instructor-2",
        }),
      );
      expect(error.code).toBe(ErrorCodes.AUTH_ROLE_FORBIDDEN);
    });

    it("reports a taken group code as a conflict", async () => {
      const group = [
        { id: "group-1", instructorId: "instructor-1", status: "active" },
      ];
      const { service } = createService([
        group,
        Object.assign(new Error("duplicate"), { cause: { code: "23505" } }),
      ]);

      const error = await rejection(
        service.updateGroup(instructor, "group-1", { code: "GRP-02" }),
      );
      expect(error.code).toBe(ErrorCodes.GROUP_CODE_ALREADY_EXISTS);
    });

    it("keeps a group with assignments and offers archiving instead", async () => {
      const { service } = createService([
        [{ id: "group-1", instructorId: "instructor-1", status: "active" }],
        [{ id: "assignment-1" }],
      ]);

      const error = await rejection(service.deleteGroup(instructor, "group-1"));
      expect(error.code).toBe(ErrorCodes.GROUP_HAS_ASSIGNMENTS);
    });
  });
});
