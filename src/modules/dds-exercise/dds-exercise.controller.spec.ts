import { HttpStatus } from "@nestjs/common";
import { GUARDS_METADATA, HTTP_CODE_METADATA } from "@nestjs/common/constants";

import { JwtAuthGuard } from "@/modules/auth/jwt-auth.guard";
import { ROLES_METADATA_KEY } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";

import type { DdsExerciseService } from "./application/dds-exercise.service";
import { DdsExerciseController } from "./dds-exercise.controller";

describe(DdsExerciseController.name, () => {
  it("authenticates every route and restricts the workspace to operators", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, DdsExerciseController)).toEqual(
      [JwtAuthGuard, RolesGuard],
    );
    expect(
      Reflect.getMetadata(ROLES_METADATA_KEY, DdsExerciseController),
    ).toEqual(["operator"]);
  });

  it("starts an exercise on behalf of the authenticated operator", async () => {
    const exercises = {
      start: jest.fn().mockResolvedValue({ id: "exercise-1" }),
    };
    const controller = new DdsExerciseController(
      exercises as unknown as DdsExerciseService,
    );
    const body = {
      scenarioVersionId: "a95237ec-cf7c-4139-a96f-c6201800fd4f",
      eventId: "e29a7c15-c910-4ae9-a778-d9a3d76e0bc7",
    };

    await controller.start(
      body as never,
      {
        user: { sub: "operator-1", role: "operator" },
      } as never,
    );

    expect(exercises.start).toHaveBeenCalledWith("operator-1", body);
  });

  it("returns 200 for an idempotent status command", () => {
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        DdsExerciseController.prototype.transition,
      ),
    ).toBe(HttpStatus.OK);
  });
});
