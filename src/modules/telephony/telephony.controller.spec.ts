import { HttpStatus } from "@nestjs/common";
import { HTTP_CODE_METADATA } from "@nestjs/common/constants";

import { ROLES_METADATA_KEY } from "@/modules/auth/roles.decorator";

import type { CrewClickToCallService } from "./application/crew-click-to-call.service";
import type { DrizzleTelephonyDirectory } from "./infrastructure/drizzle-telephony.directory";
import { TelephonyController } from "./telephony.controller";

describe(TelephonyController.name, () => {
  it("reserves click-to-call for the operator who owns the card", async () => {
    expect(
      Reflect.getMetadata(
        ROLES_METADATA_KEY,
        TelephonyController.prototype.startCrewCall,
      ),
    ).toEqual(["operator"]);
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        TelephonyController.prototype.startCrewCall,
      ),
    ).toBe(HttpStatus.ACCEPTED);

    const clickToCall = { start: jest.fn().mockResolvedValue({}) };
    const controller = new TelephonyController(
      {} as DrizzleTelephonyDirectory,
      clickToCall as unknown as CrewClickToCallService,
    );
    const body = { eventId: "event-1", dialedNumber: "1012" };

    await controller.startCrewCall(
      "exercise-1",
      body as never,
      {
        user: { sub: "operator-1", role: "operator" },
      } as never,
    );

    expect(clickToCall.start).toHaveBeenCalledWith(
      "operator-1",
      "exercise-1",
      body,
    );
  });
});
