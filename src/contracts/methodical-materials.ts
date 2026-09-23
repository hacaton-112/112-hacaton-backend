import { z } from "zod";

import { UserRoleSchema } from "./auth";

const MaterialIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/u);

export const MethodicalSectionSchema = z.object({
  id: MaterialIdSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  items: z.array(z.string().min(1)).min(1),
  note: z.string().min(1).optional(),
  contentMarkdown: z.string().min(1),
  completed: z.boolean(),
  completedAt: z.iso.datetime().nullable(),
});

export const MethodicalMaterialSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  audience: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  roles: z.array(UserRoleSchema).min(1),
  updatedAt: z.iso.datetime().nullable(),
  completedSections: z.number().int().nonnegative(),
  totalSections: z.number().int().positive(),
  sections: z.array(MethodicalSectionSchema).min(1),
});

export const MethodicalMaterialListSchema = z.object({
  materials: z.array(MethodicalMaterialSchema),
});

export const MethodicalSectionInputSchema = z
  .object({
    id: MaterialIdSchema.optional(),
    title: z.string().trim().min(2).max(160),
    summary: z.string().trim().min(2).max(500),
    contentMarkdown: z.string().trim().min(1).max(50_000),
  })
  .strict();

export const MethodicalMaterialInputSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().min(2).max(1_000),
    audience: z.string().trim().min(2).max(200),
    durationMinutes: z.number().int().min(1).max(480),
    roles: z.array(UserRoleSchema).min(1),
    sections: z.array(MethodicalSectionInputSchema).min(1).max(50),
  })
  .strict()
  .superRefine((material, context) => {
    const sectionIds = material.sections
      .map(({ id }) => id)
      .filter((id): id is string => id !== undefined);
    if (new Set(sectionIds).size !== sectionIds.length) {
      context.addIssue({
        code: "custom",
        path: ["sections"],
        message: "Идентификаторы разделов не должны повторяться",
      });
    }
    if (new Set(material.roles).size !== material.roles.length) {
      context.addIssue({
        code: "custom",
        path: ["roles"],
        message: "Роли не должны повторяться",
      });
    }
  });

export type MethodicalSection = z.infer<typeof MethodicalSectionSchema>;
export type MethodicalMaterial = z.infer<typeof MethodicalMaterialSchema>;
export type MethodicalMaterialInput = z.infer<
  typeof MethodicalMaterialInputSchema
>;
