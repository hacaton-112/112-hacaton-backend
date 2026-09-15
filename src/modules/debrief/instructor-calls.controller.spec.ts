import type { InstructorCallView } from "@/modules/training/dto/training.dto";
import type { TrainingService } from "@/modules/training/training.service";

import type { DebriefService } from "./application/debrief.service";
import { InstructorCallsController } from "./instructor-calls.controller";

const request = {
  user: { sub: "instructor-1", role: "instructor" },
} as never;

const call = (
  overrides: Partial<InstructorCallView> = {},
): InstructorCallView => ({
  trainingSessionId: "session-1",
  assignmentId: "assignment-1",
  assignmentTitle: "Пожар в жилом доме",
  groupId: "group-1",
  groupName: "Смена А",
  operatorId: "operator-1",
  operatorName: "Анна Оператор",
  scenarioCode: "FIRE-01",
  title: "Пожар в жилом доме",
  stage: "ended",
  offeredAt: "2026-09-15T12:00:00.000Z",
  answeredAt: "2026-09-15T12:00:05.000Z",
  endedAt: "2026-09-15T12:02:00.000Z",
  durationSeconds: 115,
  attemptNumber: 1,
  attemptStatus: "completed",
  passThreshold: 75,
  score: null,
  ...overrides,
});

describe(InstructorCallsController.name, () => {
  it("hydrates missing scores in the instructor result list", async () => {
    const training = {
      listInstructorCalls: jest.fn().mockResolvedValue([call()]),
    };
    const debrief = {
      get: jest.fn().mockResolvedValue({ evaluation: { score: 91 } }),
    };
    const controller = new InstructorCallsController(
      training as unknown as TrainingService,
      debrief as unknown as DebriefService,
    );

    await expect(
      controller.list(request, "group-1", "operator-1"),
    ).resolves.toEqual({ calls: [call({ score: 91 })] });
    expect(training.listInstructorCalls).toHaveBeenCalledWith(
      { id: "instructor-1", role: "instructor" },
      { groupId: "group-1", operatorId: "operator-1" },
    );
    expect(debrief.get).toHaveBeenCalledWith("session-1", "operator-1");
  });

  it("checks ownership before returning a student's debrief", async () => {
    const training = {
      requireManagedSession: jest.fn().mockResolvedValue({
        operatorId: "operator-1",
        attemptStatus: "completed",
      }),
    };
    const debrief = { get: jest.fn().mockResolvedValue({ call: {} }) };
    const controller = new InstructorCallsController(
      training as unknown as TrainingService,
      debrief as unknown as DebriefService,
    );

    await controller.get(request, "session-1");

    expect(training.requireManagedSession).toHaveBeenCalledWith(
      { id: "instructor-1", role: "instructor" },
      "session-1",
    );
    expect(debrief.get).toHaveBeenCalledWith("session-1", "operator-1");
  });
});
