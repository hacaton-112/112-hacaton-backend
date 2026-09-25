import { Inject, Injectable } from "@nestjs/common";

import { generateId } from "@/common/utils/id";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import { auditLog } from "@/drizzle/schema";

export interface AuditLogEntry {
  actorId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  sessionId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}

export type AuditLogDbClient = Pick<DrizzleService["db"], "insert">;

@Injectable()
export class AuditLogService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: DrizzleService["db"],
  ) {}

  async log(
    entry: AuditLogEntry,
    dbClient: AuditLogDbClient = this.db,
  ): Promise<void> {
    await dbClient.insert(auditLog).values({
      id: generateId(),
      actorId: entry.actorId ?? null,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId ?? null,
      sessionId: entry.sessionId ?? null,
      details: entry.details ?? null,
      ipAddress: entry.ipAddress ?? null,
    });
  }
}
