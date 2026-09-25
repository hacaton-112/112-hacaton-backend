import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { QUERY_KEYS } from "../config/query-keys";
import { ddsReportService } from "../services/dds-report.service";

export function useDdsLessonReport(lessonId?: string) {
  const client = useQueryClient();
  const report = useQuery({
    queryKey: QUERY_KEYS.ddsLessonReport(lessonId),
    queryFn: () => ddsReportService.getLesson(lessonId!),
    enabled: Boolean(lessonId),
    refetchInterval: ({ state }) => {
      const status = state.data?.insights?.status;
      return status === "pending" || status === "processing" ? 3_000 : false;
    },
  });
  const retryInsights = useMutation({
    mutationFn: () => ddsReportService.retryInsights(lessonId!),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: QUERY_KEYS.ddsLessonReport(lessonId),
      }),
  });
  return { report, retryInsights };
}

export const useMyDdsResults = () =>
  useQuery({
    queryKey: QUERY_KEYS.myDdsResults(),
    queryFn: ddsReportService.getMyResults,
  });

export const useMyDdsResult = (exerciseId?: string) =>
  useQuery({
    queryKey: QUERY_KEYS.myDdsResult(exerciseId),
    queryFn: () => ddsReportService.getMyResult(exerciseId!),
    enabled: Boolean(exerciseId),
  });
