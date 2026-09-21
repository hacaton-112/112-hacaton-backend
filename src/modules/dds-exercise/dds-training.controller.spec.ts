import { HttpStatus } from "@nestjs/common";
import { HTTP_CODE_METADATA } from "@nestjs/common/constants";

import { ROLES_METADATA_KEY } from "@/modules/auth/roles.decorator";

import type { DdsTrainingService } from "./application/dds-training.service";
import { DdsTrainingController } from "./dds-training.controller";

describe(DdsTrainingController.name, () => {
  it("starts an assigned DDS attempt only for the authenticated operator", async () => {
    expect(
      Reflect.getMetadata(
        ROLES_METADATA_KEY,
        DdsTrainingController.prototype.start,
      ),
    ).toEqual(["operator"]);
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        DdsTrainingController.prototype.start,
      ),
    ).toBe(HttpStatus.OK);

    const training = { start: jest.fn().mockResolvedValue({}) };
    const controller = new DdsTrainingController(
      training as unknown as DdsTrainingService,
    );
    const body = { eventId: "e29a7c15-c910-4ae9-a778-d9a3d76e0bc7" };

    await controller.start(
      "assignment-1",
      body as never,
      {
        user: { sub: "operator-1", role: "operator" },
      } as never,
    );

    expect(training.start).toHaveBeenCalledWith(
      "operator-1",
      "assignment-1",
      body.eventId,
    );
  });

  it("keeps stop and review under instructor management", () => {
    expect(
      Reflect.getMetadata(ROLES_METADATA_KEY, DdsTrainingController),
    ).toEqual(["instructor", "admin"]);
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        DdsTrainingController.prototype.stop,
      ),
    ).toBe(HttpStatus.NO_CONTENT);
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        DdsTrainingController.prototype.review,
      ),
    ).toBe(HttpStatus.NO_CONTENT);
  });

  it("returns assigned and standalone results without changing their grouping", async () => {
    const result = { attempts: [], standaloneResults: [{ exercise: {} }] };
    const training = { list: jest.fn().mockResolvedValue(result) };
    const controller = new DdsTrainingController(
      training as unknown as DdsTrainingService,
    );

    await expect(
      controller.list({
        user: { sub: "instructor-1", role: "instructor" },
      } as never),
    ).resolves.toBe(result);
    expect(training.list).toHaveBeenCalledWith({
      id: "instructor-1",
      role: "instructor",
    });
  });
});
