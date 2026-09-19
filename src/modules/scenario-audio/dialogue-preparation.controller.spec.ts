import "reflect-metadata";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { JwtAuthGuard } from "@/modules/auth/jwt-auth.guard";
import { RolesGuard } from "@/modules/auth/roles.guard";
import { ROLES_METADATA_KEY } from "@/modules/auth/roles.decorator";
import { DialoguePreparationController } from "./dialogue-preparation.controller";
import { ReviewPreparationDto } from "./dialogue-preparation.dto";

describe("private preparation API", () => {
  it("protects every route including snapshots and WAV previews from operators", () => {
    expect(
      Reflect.getMetadata(ROLES_METADATA_KEY, DialoguePreparationController),
    ).toEqual(["instructor", "admin"]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, DialoguePreparationController),
    ).toEqual([JwtAuthGuard, RolesGuard]);
  });
  it("rejects unknown reply content at the review boundary", () => {
    expect(
      ReviewPreparationDto.schema.safeParse({
        revision: 1,
        entries: [
          {
            factKey: "address",
            questions: ["Назовите адрес?"],
            acknowledge: false,
            replyText: "Invented address",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      ReviewPreparationDto.schema.safeParse({ revision: 0, entries: [] })
        .success,
    ).toBe(false);
  });
});
