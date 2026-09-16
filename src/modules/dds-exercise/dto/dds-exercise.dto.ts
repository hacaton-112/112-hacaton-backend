import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { DISPATCH_SERVICES, SCENARIO_CATEGORIES } from "@/drizzle/schema";

import { DDS_EXERCISE_VIOLATIONS } from "../domain/dds-exercise-evaluation";
import { DDS_RESPONSE_STATUSES } from "../domain/dds-response-status";

const nullableText = (max: number) => z.string().trim().max(max).nullable();

export const DdsCardSnapshotSchema = z
  .object({
    scenarioCode: z.string().min(1).max(32),
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(2_000),
    category: z.enum(SCENARIO_CATEGORIES),
    addressText: z.string().min(1).max(2_000),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    callerName: nullableText(200),
    callerPhone: nullableText(32),
    incidentType: z.string().min(1).max(200),
    description: z.string().min(1).max(2_000),
    victimsTotal: z.number().int().min(0).max(9_999).nullable(),
    services: z.array(z.enum(DISPATCH_SERVICES)).min(1).max(13),
  })
  .strict();

export const DdsExerciseEventSchema = z
  .object({
    sequence: z.number().int().positive(),
    eventId: z.uuid(),
    fromStatus: z.enum(DDS_RESPONSE_STATUSES).nullable(),
    toStatus: z.enum(DDS_RESPONSE_STATUSES),
    comment: nullableText(1_000),
    occurredAt: z.iso.datetime(),
  })
  .strict();

export const DdsExerciseResultSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    passed: z.boolean(),
    acknowledgementMet: z.boolean(),
    terminalStatus: z.enum(["completed", "refused"]),
    violations: z.array(z.enum(DDS_EXERCISE_VIOLATIONS)),
  })
  .strict();

export const DdsExerciseSchema = z
  .object({
    id: z.uuid(),
    scenarioVersionId: z.uuid(),
    trainingAttemptId: z.string().min(1).nullable(),
    addressedService: z.enum(DISPATCH_SERVICES),
    status: z.enum(DDS_RESPONSE_STATUSES),
    allowedTransitions: z.array(z.enum(DDS_RESPONSE_STATUSES)),
    card: DdsCardSnapshotSchema,
    acknowledgementDeadlineAt: z.iso.datetime(),
    acknowledgedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    events: z.array(DdsExerciseEventSchema),
    result: DdsExerciseResultSchema.nullable(),
  })
  .strict();

export const DdsExerciseListSchema = z
  .object({ exercises: z.array(DdsExerciseSchema) })
  .strict();

export const StartDdsExerciseRequestSchema = z
  .object({
    scenarioVersionId: z.uuid(),
    eventId: z.uuid(),
  })
  .strict();

export const TransitionDdsExerciseRequestSchema = z
  .object({
    eventId: z.uuid(),
    status: z.enum(DDS_RESPONSE_STATUSES).exclude(["pending"]),
    comment: z.string().trim().max(1_000).optional(),
  })
  .strict();

export class DdsExerciseDto extends createZodDto(DdsExerciseSchema) {}
export class DdsExerciseListDto extends createZodDto(DdsExerciseListSchema) {}
export class StartDdsExerciseRequestDto extends createZodDto(
  StartDdsExerciseRequestSchema,
) {}
export class TransitionDdsExerciseRequestDto extends createZodDto(
  TransitionDdsExerciseRequestSchema,
) {}

export type DdsCardSnapshot = z.infer<typeof DdsCardSnapshotSchema>;
export type DdsExerciseEvent = z.infer<typeof DdsExerciseEventSchema>;
export type DdsExerciseResult = z.infer<typeof DdsExerciseResultSchema>;
export type DdsExercise = z.infer<typeof DdsExerciseSchema>;
export type DdsExerciseList = z.infer<typeof DdsExerciseListSchema>;
export type StartDdsExerciseRequest = z.infer<
  typeof StartDdsExerciseRequestSchema
>;
export type TransitionDdsExerciseRequest = z.infer<
  typeof TransitionDdsExerciseRequestSchema
>;
