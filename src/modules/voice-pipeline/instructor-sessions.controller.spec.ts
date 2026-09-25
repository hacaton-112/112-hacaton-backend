import { ErrorCodes } from "@/contracts";
import type { TrainingService } from "@/modules/training/application/training.service";

import { InstructorSessionsController } from "./instructor-sessions.controller";
import type { VoicePipelineGateway } from "./transport/websocket/voice-pipeline.gateway";

const request = {
  user: { sub: "instructor-1", role: "instructor" },
} as never;

describe(InstructorSessionsController.name, () => {
  it("ends an active managed session with the supplied reason", async () => {
    const training = {
      requireManagedSession: jest
        .fn()
        .mockResolvedValue({
          operatorId: "operator-1",
          attemptStatus: "active",
        }),
    };
    const endedAt = new Date("2026-09-15T12:10:00.000Z");
    const gateway = {
      endSessionByInstructor: jest.fn().mockResolvedValue(endedAt),
    };
    const controller = new InstructorSessionsController(
      training as unknown as TrainingService,
      gateway as unknown as VoicePipelineGateway,
    );

    await expect(
      controller.end(request, "session-1", {
        reason: "Завершено преподавателем",
      }),
    ).resolves.toEqual({
      trainingSessionId: "session-1",
      status: "cancelled_by_instructor",
      endedAt: endedAt.toISOString(),
    });
    expect(gateway.endSessionByInstructor).toHaveBeenCalledWith(
      "session-1",
      "instructor-1",
      "Завершено преподавателем",
    );
  });

  it("does not end a session that is already finished", async () => {
    const training = {
      requireManagedSession: jest.fn().mockResolvedValue({
        operatorId: "operator-1",
        attemptStatus: "completed",
      }),
    };
    const gateway = { endSessionByInstructor: jest.fn() };
    const controller = new InstructorSessionsController(
      training as unknown as TrainingService,
      gateway as unknown as VoicePipelineGateway,
    );

    await expect(
      controller.end(request, "session-1", { reason: "Уже завершено" }),
    ).rejects.toMatchObject({ code: ErrorCodes.TRAINING_SESSION_NOT_ACTIVE });
    expect(gateway.endSessionByInstructor).not.toHaveBeenCalled();
  });
});
