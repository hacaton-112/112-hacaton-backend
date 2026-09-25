import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { AppBadRequestException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import { auditLog, users } from "@/drizzle/schema";

import { auditEntryHasError, auditLogPeriod } from "../domain/audit-log-query";
import type {
  AuditLogItem,
  AuditLogPage,
  AuditLogQuery,
} from "../dto/audit-log.dto";
import type { AuditLogRepository } from "../ports/audit-log.repository";

@Injectable()
export class DrizzleAuditLogRepository implements AuditLogRepository {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: DrizzleService["db"],
  ) {}

  async search(query: AuditLogQuery): Promise<AuditLogPage> {
    const filter = this.conditions(query);
    const rows = await this.db
      .select({
        id: auditLog.id,
        actorId: auditLog.actorId,
        actorName: users.fullName,
        actorEmail: users.email,
        action: auditLog.action,
        resource: auditLog.resource,
        resourceId: auditLog.resourceId,
        sessionId: auditLog.sessionId,
        details: auditLog.details,
        ipAddress: auditLog.ipAddress,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(filter)
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(query.limit)
      .offset(query.offset);

    const [totals] = await this.db
      .select({ total: count() })
      .from(auditLog)
      .where(filter);

    return {
      items: rows.map((row): AuditLogItem => ({
        id: row.id,
        actor: row.actorId
          ? {
              id: row.actorId,
              fullName: row.actorName ?? null,
              email: row.actorEmail ?? null,
            }
          : null,
        action: row.action,
        resource: row.resource,
        resourceId: row.resourceId ?? null,
        sessionId: row.sessionId ?? null,
        details: row.details ?? null,
        ipAddress: row.ipAddress ?? null,
        createdAt: row.createdAt.toISOString(),
        hasError: auditEntryHasError(row.action, row.details ?? null),
      })),
      total: totals?.total ?? 0,
      limit: query.limit,
      offset: query.offset,
    };
  }

  private conditions(query: AuditLogQuery): SQL | undefined {
    let period;
    try {
      period = auditLogPeriod(query.from, query.to);
    } catch {
      throw new AppBadRequestException(
        ErrorCodes.REPORT_INVALID_PERIOD,
        "The audit period ends before it starts",
      );
    }

    const hasError = sql<boolean>`(
      ${auditLog.action} like '%.failed'
      or coalesce(${auditLog.details} ? 'error', false)
      or coalesce(${auditLog.details} ? 'errorCode', false)
    )`;
    const conditions: SQL[] = [
      ...(period.since ? [gte(auditLog.createdAt, period.since)] : []),
      ...(period.until ? [lt(auditLog.createdAt, period.until)] : []),
      ...(query.actorId ? [eq(auditLog.actorId, query.actorId)] : []),
      ...(query.action ? [eq(auditLog.action, query.action)] : []),
      ...(query.resource ? [eq(auditLog.resource, query.resource)] : []),
      ...(query.resourceId
        ? [eq(auditLog.resourceId, query.resourceId)]
        : []),
      ...(query.hasError !== undefined
        ? [eq(hasError, query.hasError)]
        : []),
    ];

    return conditions.length > 0 ? and(...conditions) : undefined;
  }
}
