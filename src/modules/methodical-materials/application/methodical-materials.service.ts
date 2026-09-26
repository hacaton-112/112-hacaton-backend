import { Inject, Injectable } from "@nestjs/common";
import { and, eq, notInArray } from "drizzle-orm";

import {
  AppForbiddenException,
  AppNotFoundException,
} from "@/common/exceptions/app.exception";
import { generateId } from "@/common/utils/id";
import { ErrorCodes } from "@/contracts";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  methodicalMaterials,
  methodicalSectionProgress,
  type MethodicalMaterialRecord,
  type StoredMethodicalSection,
  type UserRole,
} from "@/drizzle/schema";
import { AuditLogService } from "@/modules/audit-log/application/audit-log.service";

import type {
  MethodicalMaterial,
  MethodicalMaterialInput,
} from "../dto/methodical-materials.dto";
import {
  METHODICAL_MATERIALS,
  type MethodicalMaterialDefinition,
  type MethodicalSectionDefinition,
} from "../domain/methodical-materials.content";

type AuthoringActor = { id: string; role: UserRole };

type EditableSection = {
  id: string;
  title: string;
  summary: string;
  contentMarkdown: string;
};

type EditableMaterial = {
  id: string;
  title: string;
  description: string;
  audience: string;
  durationMinutes: number;
  roles: UserRole[];
  sections: EditableSection[];
  updatedAt: Date | null;
};

@Injectable()
export class MethodicalMaterialsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService["db"],
    private readonly audit: AuditLogService,
  ) {}

  async list(userId: string, role: UserRole): Promise<MethodicalMaterial[]> {
    const [definitions, completion] = await Promise.all([
      this.definitions(),
      this.completionFor(userId),
    ]);

    return definitions
      .filter((material) => this.canAccess(role, material))
      .map((material) => this.withProgress(material, completion));
  }

  async create(
    actor: AuthoringActor,
    input: MethodicalMaterialInput,
  ): Promise<MethodicalMaterial> {
    this.assertCanAuthor(actor);
    const material = this.materialFromInput(generateId(), input);
    const now = new Date();
    const [created] = await this.db
      .insert(methodicalMaterials)
      .values(this.storedValues(material, actor.id, now))
      .returning();
    if (!created) {
      throw new Error("The inserted methodical material was not returned");
    }

    await this.audit.log({
      actorId: actor.id,
      action: "methodical-material.created",
      resource: "methodical-material",
      resourceId: created.id,
      details: { roles: created.roles, sectionCount: created.sections.length },
    });

    return this.withProgress(this.fromRecord(created), new Map());
  }

  async update(
    actor: AuthoringActor,
    materialId: string,
    input: MethodicalMaterialInput,
  ): Promise<MethodicalMaterial> {
    this.assertCanAuthor(actor);
    await this.requireMaterial(materialId);
    const material = this.materialFromInput(materialId, input);
    const now = new Date();
    const [updated] = await this.db
      .insert(methodicalMaterials)
      .values(this.storedValues(material, actor.id, now))
      .onConflictDoUpdate({
        target: methodicalMaterials.id,
        set: {
          title: material.title,
          description: material.description,
          audience: material.audience,
          durationMinutes: material.durationMinutes,
          roles: material.roles,
          sections: material.sections.map(toStoredSection),
          updatedAt: now,
        },
      })
      .returning();
    if (!updated) {
      throw new Error("The updated methodical material was not returned");
    }

    const retainedSectionIds = material.sections.map((section) => section.id);
    await this.db
      .delete(methodicalSectionProgress)
      .where(
        and(
          eq(methodicalSectionProgress.materialId, materialId),
          notInArray(methodicalSectionProgress.sectionId, retainedSectionIds),
        ),
      );
    await this.audit.log({
      actorId: actor.id,
      action: "methodical-material.updated",
      resource: "methodical-material",
      resourceId: materialId,
      details: { roles: updated.roles, sectionCount: updated.sections.length },
    });

    return this.withProgress(
      this.fromRecord(updated),
      await this.completionFor(actor.id, materialId),
    );
  }

  async setSectionCompletion(
    userId: string,
    role: UserRole,
    materialId: string,
    sectionId: string,
    completed: boolean,
  ): Promise<MethodicalMaterial> {
    const material = await this.findAccessibleMaterial(role, materialId);
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
        .values({ id: generateId(), userId, materialId, sectionId })
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

    return this.withProgress(
      material,
      await this.completionFor(userId, materialId),
    );
  }

  private async definitions(): Promise<EditableMaterial[]> {
    const records = await this.db.select().from(methodicalMaterials);
    const overrides = new Map(
      records.map((record) => [record.id, this.fromRecord(record)]),
    );
    const definitions = METHODICAL_MATERIALS.map(
      (material) => overrides.get(material.id) ?? this.fromBuiltIn(material),
    );
    const builtInIds = new Set(METHODICAL_MATERIALS.map(({ id }) => id));
    for (const record of records) {
      if (!builtInIds.has(record.id)) definitions.push(this.fromRecord(record));
    }
    return definitions;
  }

  private assertCanAuthor(actor: AuthoringActor): void {
    if (actor.role === "instructor" || actor.role === "admin") return;
    throw new AppForbiddenException(
      ErrorCodes.AUTH_ROLE_FORBIDDEN,
      "Only instructors and administrators can author methodical materials",
    );
  }

  private async requireMaterial(materialId: string): Promise<EditableMaterial> {
    const material = await this.definitionById(materialId);
    if (!material) throw materialNotFound();
    return material;
  }

  private async definitionById(
    materialId: string,
  ): Promise<EditableMaterial | null> {
    const [record] = await this.db
      .select()
      .from(methodicalMaterials)
      .where(eq(methodicalMaterials.id, materialId))
      .limit(1);
    if (record) return this.fromRecord(record);
    const builtIn = METHODICAL_MATERIALS.find(({ id }) => id === materialId);
    return builtIn ? this.fromBuiltIn(builtIn) : null;
  }

  private async findAccessibleMaterial(
    role: UserRole,
    materialId: string,
  ): Promise<EditableMaterial> {
    const material = await this.definitionById(materialId);
    if (!material || !this.canAccess(role, material)) throw materialNotFound();
    return material;
  }

  private canAccess(role: UserRole, material: EditableMaterial): boolean {
    return (
      role === "admin" || role === "instructor" || material.roles.includes(role)
    );
  }

  private async completionFor(
    userId: string,
    materialId?: string,
  ): Promise<Map<string, string>> {
    const condition = materialId
      ? and(
          eq(methodicalSectionProgress.userId, userId),
          eq(methodicalSectionProgress.materialId, materialId),
        )
      : eq(methodicalSectionProgress.userId, userId);
    const rows = await this.db
      .select({
        materialId: methodicalSectionProgress.materialId,
        sectionId: methodicalSectionProgress.sectionId,
        completedAt: methodicalSectionProgress.completedAt,
      })
      .from(methodicalSectionProgress)
      .where(condition);
    return new Map(
      rows.map((row) => [
        `${row.materialId}:${row.sectionId}`,
        row.completedAt.toISOString(),
      ]),
    );
  }

  private withProgress(
    material: EditableMaterial,
    completion: ReadonlyMap<string, string>,
  ): MethodicalMaterial {
    const sections = material.sections.map((section) => {
      const completedAt =
        completion.get(`${material.id}:${section.id}`) ?? null;
      return {
        ...section,
        items: legacyItemsFromMarkdown(section.contentMarkdown),
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
      roles: [...material.roles],
      updatedAt: material.updatedAt?.toISOString() ?? null,
      completedSections: sections.filter((section) => section.completed).length,
      totalSections: sections.length,
      sections,
    };
  }

  private fromRecord(record: MethodicalMaterialRecord): EditableMaterial {
    return {
      id: record.id,
      title: record.title,
      description: record.description,
      audience: record.audience,
      durationMinutes: record.durationMinutes,
      roles: [...record.roles],
      sections: record.sections.map((section) => ({ ...section })),
      updatedAt: record.updatedAt,
    };
  }

  private fromBuiltIn(
    material: MethodicalMaterialDefinition,
  ): EditableMaterial {
    return {
      id: material.id,
      title: material.title,
      description: material.description,
      audience: material.audience,
      durationMinutes: material.durationMinutes,
      roles: [...material.roles],
      sections: material.sections.map((section) => ({
        id: section.id,
        title: section.title,
        summary: section.summary,
        contentMarkdown: markdownFromBuiltIn(section),
      })),
      updatedAt: null,
    };
  }

  private materialFromInput(
    id: string,
    input: MethodicalMaterialInput,
  ): EditableMaterial {
    return {
      id,
      title: input.title,
      description: input.description,
      audience: input.audience,
      durationMinutes: input.durationMinutes,
      roles: [...input.roles],
      sections: input.sections.map((section) => ({
        id: section.id ?? generateId(),
        title: section.title,
        summary: section.summary,
        contentMarkdown: section.contentMarkdown,
      })),
      updatedAt: null,
    };
  }

  private storedValues(
    material: EditableMaterial,
    createdBy: string,
    now: Date,
  ) {
    return {
      id: material.id,
      title: material.title,
      description: material.description,
      audience: material.audience,
      durationMinutes: material.durationMinutes,
      roles: material.roles,
      sections: material.sections.map(toStoredSection),
      createdBy,
      createdAt: now,
      updatedAt: now,
    };
  }
}

function toStoredSection(section: EditableSection): StoredMethodicalSection {
  return {
    id: section.id,
    title: section.title,
    summary: section.summary,
    contentMarkdown: section.contentMarkdown,
  };
}

export function markdownFromBuiltIn(
  section: MethodicalSectionDefinition,
): string {
  const items = section.items.map((item) => `- ${item}`).join("\n");
  return section.note ? `${items}\n\n> ${section.note}` : items;
}

export function legacyItemsFromMarkdown(markdown: string): string[] {
  const items = markdown
    .split("\n")
    .map((line) => line.match(/^\s*(?:[-*+] |\d+[.)]\s+)(.+)$/u)?.[1]?.trim())
    .filter((item): item is string => Boolean(item));
  if (items.length > 0) return items;

  const paragraph = markdown
    .split(/\n\s*\n/u)
    .map((value) => value.replace(/^#+\s*/u, "").trim())
    .find(Boolean);
  return paragraph ? [paragraph] : [markdown.trim()];
}

function materialNotFound(): AppNotFoundException {
  return new AppNotFoundException(
    ErrorCodes.METHODICAL_MATERIAL_NOT_FOUND,
    "Methodical material not found",
  );
}
