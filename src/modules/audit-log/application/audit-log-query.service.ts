import { Inject, Injectable } from "@nestjs/common";

import { AUDIT_LOG_REPOSITORY } from "../audit-log.tokens";
import type {
  AuditLogPage,
  AuditLogQuery,
} from "../dto/audit-log.dto";
import type { AuditLogRepository } from "../ports/audit-log.repository";

@Injectable()
export class AuditLogQueryService {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly repository: AuditLogRepository,
  ) {}

  search(query: AuditLogQuery): Promise<AuditLogPage> {
    return this.repository.search(query);
  }
}
