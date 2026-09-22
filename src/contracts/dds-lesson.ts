import { z } from "zod";

import { SCENARIO_CATEGORIES } from "./scenario-authoring";
import { DDS_SERVICE_CODES, DdsExerciseSchema } from "./dds-exercise";

export const DDS_LESSON_CARD_SOURCES = [
  "generated",
  "operator_call",
  "mixed",
] as const;
export const DDS_LESSON_STATUSES = ["active", "finished"] as const;

export const CreateDdsLessonSchema = z
  .object({
    eventId: z.uuid(),
    groupId: z.uuid().optional(),
    targetUserId: z.uuid().optional(),
    title: z.string().trim().min(2).max(160),
    categories: z.array(z.enum(SCENARIO_CATEGORIES)).min(1),
    cardSource: z.enum(DDS_LESSON_CARD_SOURCES),
    acknowledgementNormSeconds: z.number().int().min(10).max(300),
    passThreshold: z.number().int().min(50).max(100),
  })
  .strict();

export const DdsLessonSummarySchema = z
  .object({
    id: z.uuid(),
    createdBy: z.uuid(),
    groupId: z.uuid().nullable(),
    targetUserId: z.uuid().nullable(),
    title: z.string(),
    categories: z.array(z.enum(SCENARIO_CATEGORIES)).min(1),
    cardSource: z.enum(DDS_LESSON_CARD_SOURCES),
    acknowledgementNormSeconds: z.number().int(),
    passThreshold: z.number().int(),
    status: z.enum(DDS_LESSON_STATUSES),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
    finishedBy: z.uuid().nullable(),
  })
  .strict();

export const DdsLessonSchema = DdsLessonSummarySchema.extend({
  participants: z.array(
    z.object({
      userId: z.uuid(),
      fullName: z.string(),
      service: z.enum(DDS_SERVICE_CODES).nullable(),
    }),
  ),
  cards: z.array(
    z.object({
      operatorId: z.uuid(),
      operatorName: z.string(),
      exercise: DdsExerciseSchema,
    }),
  ),
}).strict();

export const DdsLessonListSchema = z.object({
  lessons: z.array(DdsLessonSchema),
});
export const ActiveDdsLessonListSchema = z.object({
  lessons: z.array(DdsLessonSummarySchema),
});
export const NextDdsLessonCardResponseSchema = z.object({
  status: z.enum(["ready", "empty"]),
  exercise: DdsExerciseSchema.optional(),
  reason: z.string().optional(),
});

export type CreateDdsLesson = z.infer<typeof CreateDdsLessonSchema>;
export type DdsLesson = z.infer<typeof DdsLessonSchema>;
export type DdsLessonSummary = z.infer<typeof DdsLessonSummarySchema>;
export type DdsLessonCardSource = (typeof DDS_LESSON_CARD_SOURCES)[number];
export type NextDdsLessonCardResponse = z.infer<
  typeof NextDdsLessonCardResponseSchema
>;
