import { Global, Module } from "@nestjs/common";

import { env } from "@/core/config/env.config";

import { AuditLogRetentionJanitor } from "./audit-log-retention.janitor";
import {
  AUDIT_LOG_RETENTION,
  type AuditLogRetentionSettings,
} from "./audit-log.tokens";
import { AuditLogService } from "./audit-log.service";

@Global()
@Module({
  providers: [
    AuditLogService,
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
