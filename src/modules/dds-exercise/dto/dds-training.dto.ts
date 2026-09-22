import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { ATTEMPT_STATUSES, DISPATCH_SERVICES } from "@/drizzle/schema";
import { DDS_LIVE_FINDINGS } from "../domain/dds-live-findings";
import { DDS_RESPONSE_STATUSES } from "../domain/dds-response-status";
import { DdsExerciseSchema } from "./dds-exercise.dto";

export const StartAssignedDdsSchema = z.object({ eventId: z.uuid() }).strict();
export class StartAssignedDdsDto extends createZodDto(StartAssignedDdsSchema) {}
export const ReviewDdsSchema = z.object({
  eventId: z.uuid(),
  score: z.number().int().min(0).max(100),
  comment: z.string().trim().min(3).max(2_000),
}).strict();
export class ReviewDdsDto extends createZodDto(ReviewDdsSchema) {}
export const StopDdsSchema = z.object({ reason: z.string().trim().min(3).max(1_000) }).strict();
export class StopDdsDto extends createZodDto(StopDdsSchema) {}
export const DdsTrainingAttemptSchema = z.object({
  exercise: DdsExerciseSchema,
  // Карточка очереди смены приходит без назначения и попытки: её диспетчер
  // взял из профильной очереди, а не получил учебным заданием.
  assignmentId: z.uuid().nullable(),
  assignmentTitle: z.string().nullable(),
  operatorId: z.uuid(),
  operatorName: z.string(),
  attemptNumber: z.number().int().positive().nullable(),
  attemptStatus: z.enum(ATTEMPT_STATUSES).nullable(),
  passThreshold: z.number().int().min(50).max(100),
  reviews: z.array(z.object({
    eventId: z.uuid(), instructorId: z.uuid(), score: z.number().int().min(0).max(100),
    comment: z.string(), createdAt: z.iso.datetime(),
  }).strict()),
}).strict();
export const DdsTrainingListSchema = z.object({ attempts: z.array(DdsTrainingAttemptSchema) }).strict();
export class DdsTrainingListDto extends createZodDto(DdsTrainingListSchema) {}
export type DdsTrainingAttempt = z.infer<typeof DdsTrainingAttemptSchema>;

/** Идущая попытка в мониторинге: без журнала и карточки целиком. */
export const DdsLiveAttemptSchema = z.object({
  exerciseId: z.uuid(),
  assignmentId: z.uuid(),
  assignmentTitle: z.string(),
  operatorId: z.uuid(),
  operatorName: z.string(),
  attemptNumber: z.number().int().positive(),
  startedAt: z.iso.datetime(),
  addressedService: z.enum(DISPATCH_SERVICES),
  cardTitle: z.string(),
  status: z.enum(DDS_RESPONSE_STATUSES),
  acknowledgementDeadlineAt: z.iso.datetime(),
  acknowledgedAt: z.iso.datetime().nullable(),
  findings: z.array(z.enum(DDS_LIVE_FINDINGS)),
}).strict();
export const DdsLiveListSchema = z.object({ attempts: z.array(DdsLiveAttemptSchema) }).strict();
export class DdsLiveListDto extends createZodDto(DdsLiveListSchema) {}
export type DdsLiveAttempt = z.infer<typeof DdsLiveAttemptSchema>;
