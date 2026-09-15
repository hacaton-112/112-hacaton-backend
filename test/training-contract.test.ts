import { describe, expect, it } from "bun:test";

import {
  callVerdict,
  toGroupTableRows,
} from "../src/components/training/training-labels";
import { CallServerEventSchema } from "../src/contracts/call";
import {
  assignmentActions,
  attemptsLeft,
  CardSourceSchema,
  isAssignmentForTarget,
  InstructorCallListSchema,
  TrainingAssignmentSchema,
} from "../src/contracts/training";

const assignment = {
  id: "0f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f01",
  title: "Пожар в жилом доме",
  scenarioVersionId: "0f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f02",
  scenarioCode: "S-015",
  scenarioTitle: "Пожар",
  category: "fire",
  difficulty: 3,
  groupId: "0f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f03",
  groupName: "ДДС Гормост — поток 1",
  targetUserId: null,
  type: "voice_call",
  cardSource: "ticket",
  serviceTag: "FIRE_101",
  answerNormSeconds: 240,
  passThreshold: 75,
  maxAttempts: 3,
  dueDate: null,
  status: "in_progress",
  usedAttempts: 1,
  launchedAt: "2026-09-15T10:00:00.000Z",
  completedAt: null,
  createdAt: "2026-09-15T09:00:00.000Z",
};

describe("training contract", () => {
  it("accepts an assignment with its card source and service", () => {
    const parsed = TrainingAssignmentSchema.parse(assignment);

    expect(parsed.cardSource).toBe("ticket");
    expect(parsed.serviceTag).toBe("FIRE_101");
  });

  it("offers the same lifecycle actions the backend allows", () => {
    expect(assignmentActions("draft")).toEqual([
      "launch",
      "edit",
      "archive",
      "delete",
    ]);
    expect(assignmentActions("in_progress")).toEqual(["complete"]);
    expect(assignmentActions("completed")).toEqual(["archive"]);
    expect(assignmentActions("archived")).toEqual([]);
  });

  it("offers every card source from the specification, including mixed", () => {
    expect(CardSourceSchema.options).toEqual([
      "generated",
      "ticket",
      "operator_call",
      "mixed",
    ]);
  });

  it("tells a group lesson from an individual one", () => {
    const student = {
      id: "0f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f05",
      fullName: "Анна",
    };
    const individual = { groupId: null, targetUserId: student.id };
    const forGroup = { groupId: assignment.groupId, targetUserId: null };

    expect(
      isAssignmentForTarget(individual, { kind: "student", student }),
    ).toBe(true);
    expect(isAssignmentForTarget(forGroup, { kind: "student", student })).toBe(
      false,
    );
    expect(
      isAssignmentForTarget(forGroup, {
        kind: "group",
        group: {
          id: assignment.groupId,
          name: "",
          code: "",
          organization: "",
          instructorId: student.id,
          status: "active",
          members: [],
          createdAt: assignment.createdAt,
          updatedAt: assignment.createdAt,
        },
      }),
    ).toBe(true);
  });

  it("counts the attempts an operator has left", () => {
    expect(attemptsLeft({ maxAttempts: 3, usedAttempts: 1 })).toBe(2);
    expect(attemptsLeft({ maxAttempts: 3, usedAttempts: 5 })).toBe(0);
    expect(attemptsLeft({ maxAttempts: null, usedAttempts: 9 })).toBeNull();
  });

  it("reads an instructor's call list with score and attempt", () => {
    const [call] = InstructorCallListSchema.parse({
      calls: [
        {
          trainingSessionId: "0f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f04",
          assignmentId: assignment.id,
          assignmentTitle: assignment.title,
          groupId: assignment.groupId,
          groupName: assignment.groupName,
          operatorId: "0f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f05",
          operatorName: "Анна Смирнова",
          scenarioCode: "S-015",
          title: "Пожар",
          stage: "ended",
          offeredAt: "2026-09-15T10:00:00.000Z",
          answeredAt: "2026-09-15T10:00:05.000Z",
          endedAt: "2026-09-15T10:04:05.000Z",
          durationSeconds: 240,
          attemptNumber: 2,
          attemptStatus: "cancelled_by_instructor",
          passThreshold: 75,
          score: 74,
        },
      ],
    }).calls;

    expect(call?.attemptStatus).toBe("cancelled_by_instructor");
    expect(callVerdict(call!)).toBe("failed");
    expect(callVerdict({ score: 75, passThreshold: 75 })).toBe("passed");
    expect(callVerdict({ score: null, passThreshold: 75 })).toBeNull();
  });

  it("keeps a group without students in the grouped table", () => {
    const group = {
      id: assignment.groupId,
      name: "ДДС Гормост — поток 1",
      code: "GRP-01",
      organization: "ГБУ «Гормост»",
      instructorId: "0f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f09",
      status: "active" as const,
      createdAt: "2026-09-15T09:00:00.000Z",
      updatedAt: "2026-09-15T09:00:00.000Z",
    };
    const member = {
      userId: "0f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f05",
      fullName: "Анна Смирнова",
      email: "a.smirnova@gormost.ru",
      serviceTag: "FIRE_101",
      joinedAt: "2026-09-15T09:30:00.000Z",
    };

    const rows = toGroupTableRows([
      { ...group, members: [member] },
      { ...group, id: "0f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f10", members: [] },
    ]);

    expect(
      rows.map((row) => [row.rowId, row.student?.fullName ?? null]),
    ).toEqual([
      [`${group.id}:${member.userId}`, "Анна Смирнова"],
      ["0f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f10", null],
    ]);
    expect(rows[0]?.membersCount).toBe(1);
  });

  it("recognises a call ended by the instructor", () => {
    const event = CallServerEventSchema.parse({
      type: "call.ended",
      reason: "instructor",
      sessionId: "session-1",
      stage: "ended",
      panicLevel: 2,
      checklistTotal: 5,
      checklistSatisfied: 3,
      answerNormSeconds: 240,
    });

    expect(event.type === "call.ended" && event.reason).toBe("instructor");
  });
});
