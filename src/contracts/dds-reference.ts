import { z } from "zod";
import { DDS_SERVICE_CODES } from "./dds-exercise";

export const DdsReferenceItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  hint: z.string(),
  approved: z.boolean(),
});
export const DdsCardReferenceSchema = z.object({
  id: z.uuid(),
  scenarioVersionId: z.uuid().nullable(),
  exerciseId: z.uuid().nullable(),
  expectedOutcome: z.enum(["accept", "refuse"]),
  refusalReasons: z.array(z.string()),
  requiredItems: z.array(DdsReferenceItemSchema),
  expectedCrewService: z.enum(DDS_SERVICE_CODES).nullable(),
  status: z.enum(["draft", "approved"]),
  jobStatus: z.enum(["pending", "processing", "done", "failed"]),
  version: z.number().int().positive(),
  approvedBy: z.uuid().nullable(),
  approvedAt: z.iso.datetime().nullable(),
  error: z.string().nullable(),
});
export type DdsCardReference = z.infer<typeof DdsCardReferenceSchema>;

export const DdsReferenceListItemSchema = z.object({
  scenarioVersionId: z.uuid(),
  code: z.string(),
  title: z.string(),
  category: z.string(),
  status: z.enum(["draft", "approved", "missing"]),
  jobStatus: z.enum(["pending", "processing", "done", "failed"]).nullable(),
  approvedItems: z.number().int().nonnegative(),
  totalItems: z.number().int().nonnegative(),
  expectedCrewService: z.enum(DDS_SERVICE_CODES).nullable(),
  error: z.string().nullable(),
});
export const DdsReferenceListSchema = z.object({
  items: z.array(DdsReferenceListItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export const DdsReferenceBulkResultSchema = z.object({
  accepted: z.array(z.uuid()),
  rejected: z.array(
    z.object({ scenarioVersionId: z.uuid(), reason: z.string() }),
  ),
});
export type DdsReferenceListItem = z.infer<typeof DdsReferenceListItemSchema>;
export type DdsReferenceStatus = DdsReferenceListItem["status"];
