import { API_CONFIG } from "../config/api";
import {
  AuditLogPageSchema,
  type AuditLogFilter,
} from "../contracts/audit-log";
import { api } from "../lib/api";

const filledParams = (filter: AuditLogFilter): Record<string, string> =>
  Object.fromEntries(
    Object.entries(filter)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );

export const auditLogService = {
  async search(filter: AuditLogFilter) {
    return AuditLogPageSchema.parse(
      await api.get<unknown>(API_CONFIG.getAuditLogUrl(), {
        params: filledParams(filter),
      }),
    );
  },
};
