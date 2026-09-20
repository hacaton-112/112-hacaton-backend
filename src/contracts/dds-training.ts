import { z } from "zod";
import {
  DDS_RESPONSE_STATUSES,
  DDS_SERVICE_CODES,
  DdsExerciseSchema,
} from "./dds-exercise";
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
  reviews: z.array(z.object({ eventId: z.uuid(), instructorId: z.uuid(), score: z.number().int().min(0).max(100), comment: z.string(), createdAt: z.iso.datetime() }).strict()),
}).strict();
export const DdsTrainingListSchema = z.object({ attempts: z.array(DdsTrainingAttemptSchema) });
export type DdsTrainingAttempt = z.infer<typeof DdsTrainingAttemptSchema>;
export type DdsReviewRequest = z.infer<typeof DdsReviewRequestSchema>;

/** Наблюдение по идущей попытке. Это не нарушение в протоколе: попытка не завершена. */
export const DDS_LIVE_FINDINGS = [
  "acknowledgement_overdue",
  "acknowledged_late",
  "crew_handoff_overdue",
  "wrong_crew_dialed",
] as const;

export const DdsLiveFindingSchema = z.enum(DDS_LIVE_FINDINGS);

export const DdsLiveAttemptSchema = z.object({
  exerciseId: z.uuid(),
  assignmentId: z.uuid(),
  assignmentTitle: z.string(),
  operatorId: z.uuid(),
  operatorName: z.string(),
  attemptNumber: z.number().int().positive(),
  startedAt: z.iso.datetime(),
  addressedService: z.enum(DDS_SERVICE_CODES),
  cardTitle: z.string(),
  status: z.enum(DDS_RESPONSE_STATUSES),
  acknowledgementDeadlineAt: z.iso.datetime(),
  acknowledgedAt: z.iso.datetime().nullable(),
  findings: z.array(DdsLiveFindingSchema),
}).strict();

export const DdsLiveListSchema = z.object({
  attempts: z.array(DdsLiveAttemptSchema),
});

export type DdsLiveAttempt = z.infer<typeof DdsLiveAttemptSchema>;
export type DdsLiveFinding = z.infer<typeof DdsLiveFindingSchema>;

export const DDS_LIVE_FINDING_LABELS: Record<DdsLiveFinding, string> = {
  acknowledgement_overdue: "Норматив истёк, статус не поставлен",
  acknowledged_late: "Первичный статус позже норматива",
  crew_handoff_overdue: "Наряд не вызван в норматив",
  wrong_crew_dialed: "Набирал не тот наряд",
};
