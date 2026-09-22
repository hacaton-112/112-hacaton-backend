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
  version: z.number().int().positive(),
  approvedBy: z.uuid().nullable(),
  approvedAt: z.iso.datetime().nullable(),
  error: z.string().nullable(),
});
export type DdsCardReference = z.infer<typeof DdsCardReferenceSchema>;
