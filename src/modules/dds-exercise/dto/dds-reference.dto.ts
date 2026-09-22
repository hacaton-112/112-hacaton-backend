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
  jobStatus: z.enum(["pending", "processing", "done", "failed"]),
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
export const DdsReferenceListQuerySchema = z.object({
  status: z.enum(["draft", "approved", "missing"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export const DdsReferenceListItemSchema = z.object({
  scenarioVersionId: z.uuid(),
  code: z.string(),
  title: z.string(),
  category: z.string(),
  status: z.enum(["draft", "approved", "missing"]),
  jobStatus: z.enum(["pending", "processing", "done", "failed"]).nullable(),
  approvedItems: z.number().int().nonnegative(),
  totalItems: z.number().int().nonnegative(),
  expectedCrewService: z.enum(DISPATCH_SERVICES).nullable(),
  error: z.string().nullable(),
});
export const DdsReferenceListSchema = z.object({
  items: z.array(DdsReferenceListItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export const DdsReferenceBulkSchema = z.object({
  scenarioVersionIds: z.array(z.uuid()).min(1).max(100),
});
export const DdsReferenceBulkResultSchema = z.object({
  accepted: z.array(z.uuid()),
  rejected: z.array(
    z.object({ scenarioVersionId: z.uuid(), reason: z.string() }),
  ),
});
export class DdsCardReferenceDto extends createZodDto(DdsCardReferenceSchema) {}
export class UpdateDdsReferenceDto extends createZodDto(
  UpdateDdsReferenceSchema,
) {}
export class RegenerateDdsReferenceDto extends createZodDto(
  RegenerateDdsReferenceSchema,
) {}
export class DdsReferenceListQueryDto extends createZodDto(
  DdsReferenceListQuerySchema,
) {}
export class DdsReferenceListDto extends createZodDto(DdsReferenceListSchema) {}
export class DdsReferenceBulkDto extends createZodDto(DdsReferenceBulkSchema) {}
export class DdsReferenceBulkResultDto extends createZodDto(
  DdsReferenceBulkResultSchema,
) {}
export type UpdateDdsReference = z.infer<typeof UpdateDdsReferenceSchema>;
export type DdsReferenceListQuery = z.infer<typeof DdsReferenceListQuerySchema>;
