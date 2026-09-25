import { z } from "zod";

import { DISPATCH_SERVICES } from "./incident";
import { SCENARIO_CATEGORIES } from "./scenario-authoring";

export const DDS_ARCHIVE_STATUSES = [
  "pending",
  "accepted",
  "not_accepted",
  "responding",
  "arrived",
  "working",
  "completed",
  "refused",
  "lesson_finished",
] as const;

export const DDS_ARCHIVE_OUTCOMES = ["passed", "failed", "unfinished"] as const;

export type DdsArchiveOutcome = (typeof DDS_ARCHIVE_OUTCOMES)[number];

export const DdsArchiveItemSchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  status: z.enum(DDS_ARCHIVE_STATUSES),
  addressedService: z.enum(DISPATCH_SERVICES),
  score: z.number().int().nullable(),
  passed: z.boolean().nullable(),
  operator: z.object({ id: z.uuid(), fullName: z.string() }).nullable(),
  lesson: z.object({ id: z.uuid(), title: z.string() }).nullable(),
  scenarioCode: z.string(),
  title: z.string(),
  category: z.enum(SCENARIO_CATEGORIES),
  incidentType: z.string(),
  addressText: z.string(),
});

export const DdsArchivePageSchema = z.object({
  items: z.array(DdsArchiveItemSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export type DdsArchiveItem = z.infer<typeof DdsArchiveItemSchema>;
export type DdsArchivePage = z.infer<typeof DdsArchivePageSchema>;

/** Пустой фильтр в запрос не уходит: сервер принимает только заполненные поля. */
export interface DdsArchiveFilter {
  search?: string;
  status?: (typeof DDS_ARCHIVE_STATUSES)[number];
  service?: (typeof DISPATCH_SERVICES)[number];
  category?: (typeof SCENARIO_CATEGORIES)[number];
  outcome?: DdsArchiveOutcome;
  operatorId?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}
