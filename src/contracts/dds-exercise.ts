import { z } from "zod";

export const DDS_RESPONSE_STATUSES = [
  "pending",
  "accepted",
  "not_accepted",
  "responding",
  "arrived",
  "working",
  "completed",
  "refused",
] as const;

export const DDS_SERVICE_CODES = [
  "dds_01",
  "dds_02",
  "dds_03",
  "dds_04",
  "zhkh",
  "antiterror",
  "eddc",
  "uadit",
  "rosgvardia",
  "cuks",
  "ass",
  "lpc",
  "ss",
] as const;

export const DDS_EXERCISE_VIOLATIONS = [
  "acknowledgement_deadline_missed",
  "response_refused",
] as const;

const DdsResponseStatusSchema = z.enum(DDS_RESPONSE_STATUSES);
const DdsServiceCodeSchema = z.enum(DDS_SERVICE_CODES);
const DdsExerciseViolationSchema = z.enum(DDS_EXERCISE_VIOLATIONS);

export const DdsCardSnapshotSchema = z.object({
  scenarioCode: z.string(),
  title: z.string(),
  summary: z.string(),
  category: z.string(),
  addressText: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  callerName: z.string().nullable(),
  callerPhone: z.string().nullable(),
  incidentType: z.string(),
  description: z.string(),
  victimsTotal: z.number().int().nullable(),
  services: z.array(DdsServiceCodeSchema),
});

export const DdsExerciseEventSchema = z.object({
  sequence: z.number().int().positive(),
  eventId: z.uuid(),
  fromStatus: DdsResponseStatusSchema.nullable(),
  toStatus: DdsResponseStatusSchema,
  comment: z.string().nullable(),
  occurredAt: z.iso.datetime(),
});

export const DdsExerciseResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  passed: z.boolean(),
  acknowledgementMet: z.boolean(),
  terminalStatus: z.enum(["completed", "refused"]),
  violations: z.array(DdsExerciseViolationSchema),
});

export const DdsExerciseSchema = z.object({
  id: z.uuid(),
  scenarioVersionId: z.uuid(),
  trainingAttemptId: z.string().nullable(),
  addressedService: DdsServiceCodeSchema,
  status: DdsResponseStatusSchema,
  allowedTransitions: z.array(DdsResponseStatusSchema),
  card: DdsCardSnapshotSchema,
  acknowledgementDeadlineAt: z.iso.datetime(),
  acknowledgedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  events: z.array(DdsExerciseEventSchema),
  result: DdsExerciseResultSchema.nullable(),
});

export const DdsExerciseListSchema = z.object({
  exercises: z.array(DdsExerciseSchema),
});

export type DdsResponseStatus = z.infer<typeof DdsResponseStatusSchema>;
export type DdsServiceCode = z.infer<typeof DdsServiceCodeSchema>;
export type DdsExerciseViolation = z.infer<typeof DdsExerciseViolationSchema>;
export type DdsCardSnapshot = z.infer<typeof DdsCardSnapshotSchema>;
export type DdsExerciseEvent = z.infer<typeof DdsExerciseEventSchema>;
export type DdsExerciseResult = z.infer<typeof DdsExerciseResultSchema>;
export type DdsExercise = z.infer<typeof DdsExerciseSchema>;
