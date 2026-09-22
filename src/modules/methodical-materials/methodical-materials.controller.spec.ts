import { GUARDS_METADATA } from "@nestjs/common/constants";

import { JwtAuthGuard } from "@/modules/auth/jwt-auth.guard";
import { ROLES_METADATA_KEY } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";

import { MethodicalMaterialsController } from "./methodical-materials.controller";
import type { MethodicalMaterialsService } from "./methodical-materials.service";

describe(MethodicalMaterialsController.name, () => {
  it("authenticates every route and reserves authoring for staff", () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, MethodicalMaterialsController),
    ).toEqual([JwtAuthGuard, RolesGuard]);
    expect(
      Reflect.getMetadata(
        ROLES_METADATA_KEY,
        MethodicalMaterialsController.prototype.create,
      ),
    ).toEqual(["instructor", "admin"]);
    expect(
      Reflect.getMetadata(
        ROLES_METADATA_KEY,
        MethodicalMaterialsController.prototype.update,
      ),
    ).toEqual(["instructor", "admin"]);
  });

  it("passes the authenticated actor to the authoring service", async () => {
    const materials = {
      create: jest.fn().mockResolvedValue({ id: "material-1" }),
    };
    const controller = new MethodicalMaterialsController(
      materials as unknown as MethodicalMaterialsService,
    );
    const request = {
      user: { sub: "instructor-1", role: "instructor" },
    } as never;
    const body = {
      title: "Памятка",
      description: "Описание",
      audience: "Операторы",
      durationMinutes: 10,
      roles: ["operator"],
      sections: [
        {
          title: "Раздел",
          summary: "Краткое описание",
          contentMarkdown: "- Действие",
        },
      ],
    } as never;

    await controller.create(request, body);

    expect(materials.create).toHaveBeenCalledWith(
      { id: "instructor-1", role: "instructor" },
      body,
    );
  });
});
