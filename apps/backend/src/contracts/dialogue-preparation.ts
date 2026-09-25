import { z } from "zod";

export const DialogueEntrySchema = z
  .object({
    factKey: z.string().min(1).max(64),
    questions: z.array(z.string().trim().min(5).max(300)).max(4),
    acknowledge: z.boolean(),
  })
  .strict();
export const DialogueEntriesSchema = z
  .array(DialogueEntrySchema)
  .min(1)
  .max(64);
export type DialogueEntry = z.infer<typeof DialogueEntrySchema>;
export const DialoguePreparationStatusSchema = z.enum([
  "queued",
  "generating",
  "review",
  "synthesizing",
  "ready",
  "failed",
  "published",
]);
export const DialoguePreparationSchema = z
  .object({
    id: z.uuid(),
    snapshotHash: z.string().length(64),
    revision: z.number().int().positive(),
    status: DialoguePreparationStatusSchema,
    entries: z.array(DialogueEntrySchema).max(64),
    completed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    workerEnabled: z.boolean(),
    error: z.enum(["generation_failed", "synthesis_failed"]).nullable(),
    scenarioVersionId: z.string().nullable(),
    previews: z.array(
      z
        .object({
          index: z.number().int().nonnegative(),
          text: z.string(),
          ready: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();
export type DialoguePreparation = z.infer<typeof DialoguePreparationSchema>;
