import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const MethodicalSectionSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().min(1),
    items: z.array(z.string().min(1)).min(1),
    note: z.string().min(1).optional(),
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

export class MethodicalMaterialDto extends createZodDto(
  MethodicalMaterialSchema,
) {}
export class MethodicalMaterialListDto extends createZodDto(
  MethodicalMaterialListSchema,
) {}
export class UpdateSectionCompletionDto extends createZodDto(
  UpdateSectionCompletionSchema,
) {}

export type MethodicalMaterial = z.infer<typeof MethodicalMaterialSchema>;
