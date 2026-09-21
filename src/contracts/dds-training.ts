import { z } from "zod";
import { DdsExerciseSchema } from "./dds-exercise";
import { TrainingAttemptStatusSchema } from "./training";

export const DdsReviewRequestSchema = z.object({
  eventId: z.uuid(), score: z.number().int().min(0).max(100),
  comment: z.string().trim().min(3).max(2_000),
}).strict();
export const DdsTrainingAttemptSchema = z.object({
  exercise: DdsExerciseSchema,
  assignmentId: z.uuid(), assignmentTitle: z.string(), operatorId: z.uuid(), operatorName: z.string(),
  attemptNumber: z.number().int().positive(), attemptStatus: TrainingAttemptStatusSchema,
  passThreshold: z.number().int().min(50).max(100),
  reviews: z.array(z.object({ eventId: z.uuid(), instructorId: z.uuid(), score: z.number().int().min(0).max(100), comment: z.string(), createdAt: z.iso.datetime() })),
});
export const DdsTrainingListSchema = z.object({ attempts: z.array(DdsTrainingAttemptSchema) });
export type DdsTrainingAttempt = z.infer<typeof DdsTrainingAttemptSchema>;
export type DdsReviewRequest = z.infer<typeof DdsReviewRequestSchema>;
