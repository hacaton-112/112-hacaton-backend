import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { USER_ROLES } from "@/drizzle/schema";

const MaterialIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/u);

export const MethodicalSectionSchema = z
  .object({
    id: MaterialIdSchema,
    title: z.string().min(1),
    summary: z.string().min(1),
    items: z.array(z.string().min(1)).min(1),
    note: z.string().min(1).optional(),
    contentMarkdown: z.string().min(1),
    completed: z.boolean(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const MethodicalMaterialSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    audience: z.string().min(1),
    durationMinutes: z.number().int().positive(),
    roles: z.array(z.enum(USER_ROLES)).min(1),
    updatedAt: z.iso.datetime().nullable(),
    completedSections: z.number().int().nonnegative(),
    totalSections: z.number().int().positive(),
    sections: z.array(MethodicalSectionSchema).min(1),
  })
  .strict();

export const MethodicalMaterialListSchema = z
  .object({ materials: z.array(MethodicalMaterialSchema) })
  .strict();

export const UpdateSectionCompletionSchema = z
  .object({ completed: z.boolean() })
  .strict();

const MethodicalSectionInputSchema = z
  .object({
    id: MaterialIdSchema.optional(),
    title: z.string().trim().min(2).max(160),
    summary: z.string().trim().min(2).max(500),
    contentMarkdown: z.string().trim().min(1).max(50_000),
  })
  .strict();

const MethodicalMaterialInputSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().min(2).max(1_000),
    audience: z.string().trim().min(2).max(200),
    durationMinutes: z.number().int().min(1).max(480),
    roles: z.array(z.enum(USER_ROLES)).min(1),
    sections: z.array(MethodicalSectionInputSchema).min(1).max(50),
  })
  .strict()
  .superRefine((material, context) => {
    const ids = new Set<string>();
    material.sections.forEach((section, index) => {
      if (!section.id) return;
      if (ids.has(section.id)) {
        context.addIssue({
          code: "custom",
          path: ["sections", index, "id"],
          message: "Section ids must be unique inside a material",
        });
      }
      ids.add(section.id);
    });
    if (new Set(material.roles).size !== material.roles.length) {
      context.addIssue({
        code: "custom",
        path: ["roles"],
        message: "Material roles must be unique",
      });
    }
  });

export const CreateMethodicalMaterialSchema = MethodicalMaterialInputSchema;
export const UpdateMethodicalMaterialSchema = MethodicalMaterialInputSchema;

export class MethodicalMaterialDto extends createZodDto(
  MethodicalMaterialSchema,
) {}
export class MethodicalMaterialListDto extends createZodDto(
  MethodicalMaterialListSchema,
) {}
export class UpdateSectionCompletionDto extends createZodDto(
  UpdateSectionCompletionSchema,
) {}
export class CreateMethodicalMaterialDto extends createZodDto(
  CreateMethodicalMaterialSchema,
) {}
export class UpdateMethodicalMaterialDto extends createZodDto(
  UpdateMethodicalMaterialSchema,
) {}

export type MethodicalMaterial = z.infer<typeof MethodicalMaterialSchema>;
export type MethodicalMaterialInput = z.infer<
  typeof MethodicalMaterialInputSchema
>;
