import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  scenarioAuthoringService,
  type ScenarioPublicationInput,
  type ScenarioVersionPublicationInput,
} from "../services/scenario-authoring.service";

export function useScenarioAuthoring() {
  const queryClient = useQueryClient();
  const reverseGeocoding = useMutation({
    mutationFn: scenarioAuthoringService.reverseGeocode,
  });
  const draft = useMutation({
    mutationFn: scenarioAuthoringService.generateDraft,
  });
  // Новая версия меняет и каталог, и брифинг: оба перечитываются.
  const invalidateCatalog = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["scenarios"] }),
      queryClient.invalidateQueries({ queryKey: ["scenario-version"] }),
    ]);
  const publication = useMutation({
    mutationFn: (input: ScenarioPublicationInput) =>
      scenarioAuthoringService.publish(input),
    onSuccess: invalidateCatalog,
  });
  const versionPublication = useMutation({
    mutationFn: (input: ScenarioVersionPublicationInput) =>
      scenarioAuthoringService.publishVersion(input),
    onSuccess: invalidateCatalog,
  });

  const archival = useMutation({
    mutationFn: (scenarioId: string) =>
      scenarioAuthoringService.archive(scenarioId),
    onSuccess: invalidateCatalog,
  });

  return {
    draft,
    publication,
    versionPublication,
    archival,
    reverseGeocoding,
  };
}
