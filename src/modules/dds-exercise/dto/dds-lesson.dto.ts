import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import {
  DDS_LESSON_CARD_SOURCES,
  DDS_LESSON_STATUSES,
  DISPATCH_SERVICES,
  SCENARIO_CATEGORIES,
} from "@/drizzle/schema";

import { DdsExerciseSchema } from "./dds-exercise.dto";

const IdSchema = z.uuid();
const DateTimeSchema = z.iso.datetime();

export const CreateDdsLessonSchema = z
  .object({
    eventId: IdSchema,
    groupId: IdSchema.optional(),
    targetUserId: IdSchema.optional(),
    title: z.string().trim().min(2).max(160),
    categories: z.array(z.enum(SCENARIO_CATEGORIES)).min(1),
    cardSource: z.enum(DDS_LESSON_CARD_SOURCES),
    acknowledgementNormSeconds: z.number().int().min(10).max(300).default(30),
    passThreshold: z.number().int().min(50).max(100).default(75),
  })
  .strict()
  .refine(
    (value) =>
      Number(value.groupId !== undefined) +
        Number(value.targetUserId !== undefined) ===
      1,
    { message: "Exactly one lesson target is required" },
  );

export const NextDdsLessonCardSchema = z.object({ eventId: IdSchema }).strict();
export const FinishDdsLessonSchema = z.object({ eventId: IdSchema }).strict();

export const DdsLessonParticipantSchema = z
  .object({
    userId: IdSchema,
    fullName: z.string(),
    service: z.enum(DISPATCH_SERVICES).nullable(),
  })
  .strict();

export const DdsLessonCardSchema = z
  .object({
    operatorId: IdSchema,
    operatorName: z.string(),
    exercise: DdsExerciseSchema,
  })
  .strict();

export const DdsLessonSummarySchema = z
  .object({
    id: IdSchema,
    createdBy: IdSchema,
    groupId: IdSchema.nullable(),
    targetUserId: IdSchema.nullable(),
    title: z.string(),
    categories: z.array(z.enum(SCENARIO_CATEGORIES)).min(1),
    cardSource: z.enum(DDS_LESSON_CARD_SOURCES),
    acknowledgementNormSeconds: z.number().int().min(10).max(300),
    passThreshold: z.number().int().min(50).max(100),
    status: z.enum(DDS_LESSON_STATUSES),
    startedAt: DateTimeSchema,
    finishedAt: DateTimeSchema.nullable(),
    finishedBy: IdSchema.nullable(),
  })
  .strict();

export const DdsLessonSchema = DdsLessonSummarySchema.extend({
  participants: z.array(DdsLessonParticipantSchema),
  cards: z.array(DdsLessonCardSchema),
}).strict();

export const DdsLessonListSchema = z
  .object({ lessons: z.array(DdsLessonSchema) })
  .strict();
export const ActiveDdsLessonListSchema = z
  .object({ lessons: z.array(DdsLessonSummarySchema) })
  .strict();

export const NextDdsLessonCardResponseSchema = z
  .object({
    status: z.enum(["ready", "empty"]),
    exercise: DdsExerciseSchema.optional(),
    reason: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.status === "ready"
        ? value.exercise !== undefined && value.reason === undefined
        : value.reason !== undefined && value.exercise === undefined,
    { message: "Lesson card response must match its status" },
  );

export class CreateDdsLessonDto extends createZodDto(CreateDdsLessonSchema) {}
export class NextDdsLessonCardDto extends createZodDto(
  NextDdsLessonCardSchema,
) {}
export class FinishDdsLessonDto extends createZodDto(FinishDdsLessonSchema) {}
export class DdsLessonDto extends createZodDto(DdsLessonSchema) {}
export class DdsLessonListDto extends createZodDto(DdsLessonListSchema) {}
export class ActiveDdsLessonListDto extends createZodDto(
  ActiveDdsLessonListSchema,
) {}
export class NextDdsLessonCardResponseDto extends createZodDto(
  NextDdsLessonCardResponseSchema,
) {}

export type CreateDdsLesson = z.infer<typeof CreateDdsLessonSchema>;
export type DdsLesson = z.infer<typeof DdsLessonSchema>;
export type DdsLessonSummary = z.infer<typeof DdsLessonSummarySchema>;
export type NextDdsLessonCardResponse = z.infer<
  typeof NextDdsLessonCardResponseSchema
>;
