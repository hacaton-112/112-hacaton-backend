import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import { AppNotFoundException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import { methodicalSectionProgress, type UserRole } from "@/drizzle/schema";

import type { MethodicalMaterial } from "./dto/methodical-materials.dto";
import {
  METHODICAL_MATERIALS,
  type MethodicalMaterialDefinition,
} from "./methodical-materials.content";

@Injectable()
export class MethodicalMaterialsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService["db"]) {}

  async list(userId: string, role: UserRole): Promise<MethodicalMaterial[]> {
    const definitions = METHODICAL_MATERIALS.filter((material) =>
      material.roles.includes(role),
    );
    const rows = await this.db
      .select({
        materialId: methodicalSectionProgress.materialId,
        sectionId: methodicalSectionProgress.sectionId,
        completedAt: methodicalSectionProgress.completedAt,
      })
      .from(methodicalSectionProgress)
      .where(eq(methodicalSectionProgress.userId, userId));
    const completion = new Map(
      rows.map((row) => [
        `${row.materialId}:${row.sectionId}`,
        row.completedAt.toISOString(),
      ]),
    );

    return definitions.map((material) =>
      this.withProgress(material, completion),
    );
  }

  async setSectionCompletion(
    userId: string,
    role: UserRole,
    materialId: string,
    sectionId: string,
    completed: boolean,
  ): Promise<MethodicalMaterial> {
    const material = this.findAccessibleMaterial(role, materialId);
    if (!material.sections.some((section) => section.id === sectionId)) {
      throw new AppNotFoundException(
        ErrorCodes.METHODICAL_SECTION_NOT_FOUND,
        "Methodical material section not found",
      );
    }

    const target = and(
      eq(methodicalSectionProgress.userId, userId),
      eq(methodicalSectionProgress.materialId, materialId),
      eq(methodicalSectionProgress.sectionId, sectionId),
    );
    if (completed) {
      await this.db
        .insert(methodicalSectionProgress)
        .values({ id: randomUUID(), userId, materialId, sectionId })
        .onConflictDoNothing({
          target: [
            methodicalSectionProgress.userId,
            methodicalSectionProgress.materialId,
            methodicalSectionProgress.sectionId,
          ],
        });
    } else {
      await this.db.delete(methodicalSectionProgress).where(target);
    }

    const rows = await this.db
      .select({
        materialId: methodicalSectionProgress.materialId,
        sectionId: methodicalSectionProgress.sectionId,
        completedAt: methodicalSectionProgress.completedAt,
      })
      .from(methodicalSectionProgress)
      .where(
        and(
          eq(methodicalSectionProgress.userId, userId),
          eq(methodicalSectionProgress.materialId, materialId),
        ),
      );
    return this.withProgress(
      material,
      new Map(
        rows.map((row) => [
          `${row.materialId}:${row.sectionId}`,
          row.completedAt.toISOString(),
        ]),
      ),
    );
  }

  private findAccessibleMaterial(
    role: UserRole,
    materialId: string,
  ): MethodicalMaterialDefinition {
    const material = METHODICAL_MATERIALS.find(
      (candidate) =>
        candidate.id === materialId && candidate.roles.includes(role),
    );
    if (!material) {
      throw new AppNotFoundException(
        ErrorCodes.METHODICAL_MATERIAL_NOT_FOUND,
        "Methodical material not found",
      );
    }
    return material;
  }

  private withProgress(
    material: MethodicalMaterialDefinition,
    completion: ReadonlyMap<string, string>,
  ): MethodicalMaterial {
    const sections = material.sections.map((section) => {
      const completedAt =
        completion.get(`${material.id}:${section.id}`) ?? null;
      return {
        ...section,
        items: [...section.items],
        completed: completedAt !== null,
        completedAt,
      };
    });
    return {
      id: material.id,
      title: material.title,
      description: material.description,
      audience: material.audience,
      durationMinutes: material.durationMinutes,
      completedSections: sections.filter((section) => section.completed).length,
      totalSections: sections.length,
      sections,
    };
  }
}
