import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const BooleanQuerySchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export const AuditLogQuerySchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    actorId: z.uuid().optional(),
    action: z.string().trim().min(1).max(200).optional(),
    resource: z.string().trim().min(1).max(200).optional(),
    resourceId: z.string().trim().min(1).max(200).optional(),
    hasError: BooleanQuerySchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
  })
  .strict();

export const AuditLogItemSchema = z
  .object({
    id: z.string(),
    actor: z
      .object({
        id: z.string(),
        fullName: z.string().nullable(),
        email: z.string().nullable(),
      })
      .nullable(),
    action: z.string(),
    resource: z.string(),
    resourceId: z.string().nullable(),
    sessionId: z.string().nullable(),
    details: z.record(z.string(), z.unknown()).nullable(),
    ipAddress: z.string().nullable(),
    createdAt: z.iso.datetime(),
    hasError: z.boolean(),
  })
  .strict();

export const AuditLogPageSchema = z
  .object({
    items: z.array(AuditLogItemSchema),
    total: z.number().int().min(0),
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().min(0),
  })
  .strict();

export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;
export type AuditLogItem = z.infer<typeof AuditLogItemSchema>;
export type AuditLogPage = z.infer<typeof AuditLogPageSchema>;

export class AuditLogQueryDto extends createZodDto(AuditLogQuerySchema) {}
export class AuditLogPageDto extends createZodDto(AuditLogPageSchema) {}
