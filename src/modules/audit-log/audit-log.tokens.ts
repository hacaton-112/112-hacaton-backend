export const AUDIT_LOG_RETENTION = Symbol("AUDIT_LOG_RETENTION");

export interface AuditLogRetentionSettings {
  readonly enabled: boolean;
  readonly retentionDays: number;
}
