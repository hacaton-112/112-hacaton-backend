import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { QUERY_KEYS } from "../config/query-keys";
import type { ScenarioGenerationJob } from "../contracts/scenario-authoring";
import { scenarioAuthoringService } from "../services/scenario-authoring.service";

/** Пока черновик готовится, статус опрашивается часто; готовый — не опрашивается. */
const POLL_MS = 2_000;

const isActive = (job: ScenarioGenerationJob) =>
  job.status === "queued" || job.status === "running";

/**
 * Черновики помощника в фоне.
 *
 * Генерация идёт на сервере сколько потребуется: страницу можно закрыть и
 * вернуться, задание останется в списке со своим статусом.
 */
export function useScenarioGenerationJobs() {
  const queryClient = useQueryClient();
  const jobs = useQuery({
    queryKey: QUERY_KEYS.scenarioGenerationJobs(),
    queryFn: scenarioAuthoringService.listDraftJobs,
    refetchInterval: (query) =>
      query.state.data?.some(isActive) ? POLL_MS : false,
  });
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.scenarioGenerationJobs(),
    });
  const enqueue = useMutation({
    mutationFn: scenarioAuthoringService.enqueueDraft,
    onSuccess: refresh,
  });
  const dismiss = useMutation({
    mutationFn: scenarioAuthoringService.dismissDraftJob,
    onSuccess: refresh,
  });

  return { jobs, enqueue, dismiss };
}

/** Одно задание с готовым черновиком: конструктор ждёт его и подставляет в форму. */
export function useScenarioGenerationJob(jobId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.scenarioGenerationJob(jobId),
    queryFn: () => scenarioAuthoringService.getDraftJob(jobId!),
    enabled: Boolean(jobId),
    refetchInterval: (query) =>
      query.state.data && !isActive(query.state.data) ? false : POLL_MS,
  });
}

export { isActive as isScenarioGenerationActive };
