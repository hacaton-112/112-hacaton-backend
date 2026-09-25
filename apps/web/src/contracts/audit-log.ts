import { z } from "zod";

export const AuditLogActorSchema = z.object({
  id: z.string(),
  fullName: z.string().nullable(),
  email: z.string().nullable(),
});

export const AuditLogItemSchema = z.object({
  id: z.string(),
  actor: AuditLogActorSchema.nullable(),
  action: z.string(),
  resource: z.string(),
  resourceId: z.string().nullable(),
  sessionId: z.string().nullable(),
  details: z.record(z.string(), z.unknown()).nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.iso.datetime(),
  hasError: z.boolean(),
});

export const AuditLogPageSchema = z.object({
  items: z.array(AuditLogItemSchema),
  total: z.number().int().min(0),
  limit: z.number().int().min(1),
  offset: z.number().int().min(0),
});

export type AuditLogItem = z.infer<typeof AuditLogItemSchema>;

export interface AuditLogFilter {
  from?: string;
  to?: string;
  actorId?: string;
  action?: string;
  resource?: string;
  resourceId?: string;
  hasError?: boolean;
  limit: number;
  offset: number;
}
