import { useQuery } from "@tanstack/react-query";

import { scenarioAuthoringService } from "../services/scenario-authoring.service";

/** Опубликованная версия целиком: брифинг в каталоге и черновик для правки. */
export function useScenarioVersion(scenarioVersionId?: string) {
  return useQuery({
    queryKey: ["scenario-version", scenarioVersionId],
    queryFn: () => scenarioAuthoringService.loadVersion(scenarioVersionId!),
    enabled: Boolean(scenarioVersionId),
    // Опубликованная версия не меняется: перечитывать её незачем, пока каталог
    // не сообщил о новой.
    staleTime: Number.POSITIVE_INFINITY,
  });
}
