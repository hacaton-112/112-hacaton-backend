import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { DISPATCH_SERVICES } from "@/drizzle/schema";

export const DdsReferenceItemSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(2).max(200),
  hint: z.string().min(2).max(300),
  approved: z.boolean(),
});
export const DdsCardReferenceSchema = z.object({
  id: z.uuid(),
  scenarioVersionId: z.uuid().nullable(),
  exerciseId: z.uuid().nullable(),
  expectedOutcome: z.enum(["accept", "refuse"]),
  refusalReasons: z.array(z.string()),
  requiredItems: z.array(DdsReferenceItemSchema),
  expectedCrewService: z.enum(DISPATCH_SERVICES).nullable(),
  status: z.enum(["draft", "approved"]),
  version: z.number().int().positive(),
  approvedBy: z.uuid().nullable(),
  approvedAt: z.iso.datetime().nullable(),
  error: z.string().nullable(),
});
export const UpdateDdsReferenceSchema = z.object({
  eventId: z.uuid(),
  expectedOutcome: z.enum(["accept", "refuse"]),
  refusalReasons: z.array(z.string().trim().min(1).max(300)).max(20),
  requiredItems: z.array(DdsReferenceItemSchema).max(30),
  expectedCrewService: z.enum(DISPATCH_SERVICES).nullable(),
  approveAll: z.boolean().default(false),
});
export const RegenerateDdsReferenceSchema = z.object({
  eventId: z.uuid(),
  comment: z.string().trim().min(2).max(2_000),
});
export class DdsCardReferenceDto extends createZodDto(DdsCardReferenceSchema) {}
export class UpdateDdsReferenceDto extends createZodDto(
  UpdateDdsReferenceSchema,
) {}
export class RegenerateDdsReferenceDto extends createZodDto(
  RegenerateDdsReferenceSchema,
) {}
export type UpdateDdsReference = z.infer<typeof UpdateDdsReferenceSchema>;
