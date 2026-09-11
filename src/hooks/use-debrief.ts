import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import type { CallSummary, Debrief } from "../contracts/debrief";
import { debriefService } from "../services/debrief.service";

export interface DebriefState {
  calls?: CallSummary[];
  debrief?: Debrief;
  isPending: boolean;
  error: Error | null;
  loadRecordingSegment: (url: string) => Promise<string>;
}

/** Данные списка вызовов или одного разбора в зависимости от маршрута. */
export function useDebrief(trainingSessionId?: string): DebriefState {
  const callsQuery = useQuery({
    queryKey: ["calls"],
    queryFn: debriefService.listCalls,
    enabled: trainingSessionId === undefined,
  });

  const debriefQuery = useQuery({
    queryKey: ["debrief", trainingSessionId],
    queryFn: () => {
      if (!trainingSessionId) {
        throw new Error("Не указана учебная сессия");
      }

      return debriefService.loadDebrief(trainingSessionId);
    },
    enabled: trainingSessionId !== undefined,
  });

  const loadRecordingSegment = useCallback(
    (url: string) => debriefService.loadRecordingSegment(url),
    [],
  );

  const activeQuery = trainingSessionId ? debriefQuery : callsQuery;

  return {
    calls: callsQuery.data,
    debrief: debriefQuery.data,
    isPending: activeQuery.isPending,
    error: activeQuery.error,
    loadRecordingSegment,
  };
}
