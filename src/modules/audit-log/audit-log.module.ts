import { Global, Module } from "@nestjs/common";

import { env } from "@/core/config/env.config";
import { AuthModule } from "@/modules/auth/auth.module";

import { AuditLogRetentionJanitor } from "./application/audit-log-retention.janitor";
import {
  AUDIT_LOG_RETENTION,
  type AuditLogRetentionSettings,
} from "./audit-log.tokens";
import { AuditLogService } from "./application/audit-log.service";
import { AuditLogController } from "./audit-log.controller";
import { AuditLogQueryService } from "./application/audit-log-query.service";
import { AUDIT_LOG_REPOSITORY } from "./audit-log.tokens";
import { DrizzleAuditLogRepository } from "./infrastructure/drizzle-audit-log.repository";

@Global()
@Module({
  imports: [AuthModule],
  controllers: [AuditLogController],
  providers: [
    AuditLogService,
    AuditLogQueryService,
    DrizzleAuditLogRepository,
    {
      provide: AUDIT_LOG_REPOSITORY,
      useExisting: DrizzleAuditLogRepository,
    },
    {
      provide: AUDIT_LOG_RETENTION,
      useValue: {
        enabled: env.AUDIT_LOG_RETENTION_ENABLED,
        retentionDays: env.AUDIT_LOG_RETENTION_DAYS,
      } satisfies AuditLogRetentionSettings,
    },
    AuditLogRetentionJanitor,
  ],
  exports: [AuditLogService],
})
export class AuditLogModule {}
