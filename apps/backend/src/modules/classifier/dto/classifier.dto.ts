import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  CLASSIFIER_VERSION_STATUSES,
  type ClassifierRoutingSnapshot,
} from "@/drizzle/schema";

const IdSchema = z.string().uuid();

export const ClassifierImportWarningSchema = z
  .object({
    code: z.enum(["missing_ekp_type", "missing_main_service"]),
    row: z.number().int().positive(),
    column: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();

export const ClassifierVersionSchema = z
  .object({
    id: IdSchema,
    version: z.number().int().positive(),
    status: z.enum(CLASSIFIER_VERSION_STATUSES),
    sourceFileName: z.string().min(1),
    sourceSheet: z.string().min(1),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    recordCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    warnings: z.array(ClassifierImportWarningSchema),
    importedAt: z.iso.datetime(),
    activatedAt: z.iso.datetime().nullable(),
    supersededAt: z.iso.datetime().nullable(),
  })
  .strict();

export const ClassifierVersionListSchema = z
  .object({ versions: z.array(ClassifierVersionSchema) })
  .strict();

export class ClassifierVersionDto extends createZodDto(
  ClassifierVersionSchema,
) {}
export class ClassifierVersionListDto extends createZodDto(
  ClassifierVersionListSchema,
) {}

export type ClassifierVersion = z.infer<typeof ClassifierVersionSchema>;
export type ClassifierVersionList = z.infer<typeof ClassifierVersionListSchema>;

export interface ClassifierTreeNodeDto {
  readonly key: string;
  readonly label: string;
  readonly level: "group" | "feature" | "leaf";
  readonly children: readonly ClassifierTreeNodeDto[];
  readonly entryId?: string;
  readonly sourceCode?: string;
}

export const ClassifierTreeNodeSchema: z.ZodType<ClassifierTreeNodeDto> =
  z.lazy(() =>
    z
      .object({
        key: z.string().min(1),
        label: z.string().min(1),
        level: z.enum(["group", "feature", "leaf"]),
        children: z.array(ClassifierTreeNodeSchema),
        entryId: IdSchema.optional(),
        sourceCode: z.string().min(1).optional(),
      })
      .strict(),
  );

export const ActiveClassifierTreeSchema = z
  .object({
    version: ClassifierVersionSchema,
    tree: z.array(ClassifierTreeNodeSchema),
  })
  .strict();

export class ActiveClassifierTreeDto extends createZodDto(
  ActiveClassifierTreeSchema,
) {}

export type ActiveClassifierTree = z.infer<typeof ActiveClassifierTreeSchema>;

export const RouteClassifierRequestSchema = z
  .object({
    entryId: IdSchema,
    qualifierCodes: z.array(z.string().min(3).max(64)).max(32).default([]),
  })
  .strict();

export class RouteClassifierRequestDto extends createZodDto(
  RouteClassifierRequestSchema,
) {}

export type RouteClassifierRequest = z.infer<
  typeof RouteClassifierRequestSchema
>;

export const ClassifierRequiredServiceSchema = z
  .object({
    code: z.string().min(1),
    name: z.string().min(1),
    routeLabel: z.string().min(1),
  })
  .strict();

export const ClassifierRoutingSchema: z.ZodType<ClassifierRoutingSnapshot> = z
  .object({
    classifierVersionId: IdSchema,
    classifierEntryId: IdSchema,
    sourceCode: z.string().min(1),
    featurePath: z.array(z.string().min(1)).min(1).max(3),
    finalType: z.string().min(1),
    ekpType: z.string().min(1).nullable(),
    mainServiceCode: z.string().min(1).nullable(),
    qualifierCodes: z.array(z.string().min(1)),
    requiredServices: z.array(ClassifierRequiredServiceSchema),
  })
  .strict();

export const RouteClassifierResponseSchema = z
  .object({
    routing: ClassifierRoutingSchema,
    availableQualifiers: z.array(
      z.object({ code: z.string().min(1), label: z.string().min(1) }).strict(),
    ),
  })
  .strict();

export class RouteClassifierResponseDto extends createZodDto(
  RouteClassifierResponseSchema,
) {}

export type RouteClassifierResponse = z.infer<
  typeof RouteClassifierResponseSchema
>;
