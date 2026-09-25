import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { QUERY_KEYS } from "../config/query-keys";
import type { AuditLogFilter } from "../contracts/audit-log";
import { auditLogService } from "../services/audit-log.service";

export const useAuditLog = (filter: AuditLogFilter) =>
  useQuery({
    queryKey: QUERY_KEYS.auditLog(filter),
    queryFn: () => auditLogService.search(filter),
    placeholderData: keepPreviousData,
  });
