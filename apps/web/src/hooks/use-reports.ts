import { useQuery } from "@tanstack/react-query";

import { QUERY_KEYS } from "../config/query-keys";
import type {
  InstructorReadinessFilters,
  InstructorReportFilters,
} from "../contracts/reports";
import { reportsService } from "../services/reports.service";

export const useInstructorReport = (filters: InstructorReportFilters | null) =>
  useQuery({
    queryKey: QUERY_KEYS.instructorReport(filters),
    queryFn: () => reportsService.get(filters!),
    enabled: filters !== null,
  });

export const useInstructorReadiness = (
  filters: InstructorReadinessFilters | null,
) =>
  useQuery({
    queryKey: QUERY_KEYS.instructorReadiness(filters),
    queryFn: () => reportsService.readiness(filters!),
    enabled: filters !== null,
  });
