import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { DISPATCH_SERVICES, SCENARIO_CATEGORIES } from "@/drizzle/schema";

import { DDS_ARCHIVE_OUTCOMES } from "../domain/dds-archive-query";
import { DDS_RESPONSE_STATUSES } from "../domain/dds-response-status";

/**
 * Запрос к архиву.
 *
 * Страница ограничена сверху: архив за учебный год — это тысячи карточек, и
 * отдавать их одним ответом незачем ни таблице, ни сети.
 */
export const DdsArchiveQuerySchema = z
  .object({
    /** Ищется в номере сценария, заголовке, адресе, типе и описании. */
    search: z.string().trim().min(1).max(200).optional(),
    status: z.enum(DDS_RESPONSE_STATUSES).optional(),
    service: z.enum(DISPATCH_SERVICES).optional(),
    category: z.enum(SCENARIO_CATEGORIES).optional(),
    outcome: z.enum(DDS_ARCHIVE_OUTCOMES).optional(),
    /** Только для преподавателя и администратора: чужой архив. */
    operatorId: z.uuid().optional(),
    lessonId: z.uuid().optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
  })
  .strict();

export const DdsArchiveItemSchema = z
  .object({
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    status: z.enum(DDS_RESPONSE_STATUSES),
    addressedService: z.enum(DISPATCH_SERVICES),
    score: z.number().int().min(0).max(100).nullable(),
    passed: z.boolean().nullable(),
    operator: z
      .object({ id: z.uuid(), fullName: z.string() })
      .nullable(),
    lesson: z.object({ id: z.uuid(), title: z.string() }).nullable(),
    scenarioCode: z.string(),
    title: z.string(),
    category: z.enum(SCENARIO_CATEGORIES),
    incidentType: z.string(),
    addressText: z.string(),
  })
  .strict();

export const DdsArchivePageSchema = z
  .object({
    items: z.array(DdsArchiveItemSchema),
    /** Сколько карточек отвечает фильтру целиком, а не на этой странице. */
    total: z.number().int().min(0),
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().min(0),
  })
  .strict();

export type DdsArchiveQuery = z.infer<typeof DdsArchiveQuerySchema>;
export type DdsArchiveItem = z.infer<typeof DdsArchiveItemSchema>;
export type DdsArchivePage = z.infer<typeof DdsArchivePageSchema>;

export class DdsArchiveQueryDto extends createZodDto(DdsArchiveQuerySchema) {}
export class DdsArchivePageDto extends createZodDto(DdsArchivePageSchema) {}
