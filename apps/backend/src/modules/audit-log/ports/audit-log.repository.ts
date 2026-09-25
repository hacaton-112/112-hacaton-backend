import type {
  AuditLogPage,
  AuditLogQuery,
} from "../dto/audit-log.dto";

export interface AuditLogRepository {
  search(query: AuditLogQuery): Promise<AuditLogPage>;
}
