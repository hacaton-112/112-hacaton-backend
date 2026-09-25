export const AUDIT_LOG_RETENTION = Symbol("AUDIT_LOG_RETENTION");
export const AUDIT_LOG_REPOSITORY = Symbol("AUDIT_LOG_REPOSITORY");

export interface AuditLogRetentionSettings {
  readonly enabled: boolean;
  readonly retentionDays: number;
}
