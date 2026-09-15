import type { TrainingService } from "@/modules/training/training.service";

import type { DebriefService } from "./application/debrief.service";
import { DebriefController } from "./debrief.controller";

const instructorRequest = {
  user: { sub: "instructor-1", role: "instructor" },
} as never;

describe(DebriefController.name, () => {
  it("serves a managed student's full recording to the instructor", async () => {
    const training = {
      requireManagedSession: jest.fn().mockResolvedValue({
        operatorId: "operator-1",
        attemptStatus: "completed",
      }),
    };
    const debrief = {
      readWholeRecording: jest
        .fn()
        .mockResolvedValue(new Uint8Array([1, 2, 3])),
    };
    const controller = new DebriefController(
      debrief as unknown as DebriefService,
      training as unknown as TrainingService,
    );

    await controller.wholeRecording("session-1", instructorRequest);

    expect(training.requireManagedSession).toHaveBeenCalledWith(
      { id: "instructor-1", role: "instructor" },
      "session-1",
    );
    expect(debrief.readWholeRecording).toHaveBeenCalledWith(
      "session-1",
      "operator-1",
    );
  });

  it("does not read a recording when managed-session access is denied", async () => {
    const accessError = new Error("not found");
    const training = {
      requireManagedSession: jest.fn().mockRejectedValue(accessError),
    };
    const debrief = { readSegment: jest.fn() };
    const controller = new DebriefController(
      debrief as unknown as DebriefService,
      training as unknown as TrainingService,
    );

    await expect(
      controller.recording("session-foreign", 0, instructorRequest),
    ).rejects.toBe(accessError);
    expect(debrief.readSegment).not.toHaveBeenCalled();
  });
});
