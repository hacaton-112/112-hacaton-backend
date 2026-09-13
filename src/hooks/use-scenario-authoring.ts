import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { ScenarioSeed } from "../contracts/scenario-authoring";
import {
  scenarioAuthoringService,
  type ScenarioAuthoringSource,
} from "../services/scenario-authoring.service";

export function useScenarioAuthoring() {
  const queryClient = useQueryClient();
  const reverseGeocoding = useMutation({
    mutationFn: scenarioAuthoringService.reverseGeocode,
  });
  const draft = useMutation({
    mutationFn: scenarioAuthoringService.generateDraft,
  });
  const publication = useMutation({
    mutationFn: (input: {
      scenario: ScenarioSeed;
      authoringSource: ScenarioAuthoringSource;
      authoringPrompt?: string;
    }) => scenarioAuthoringService.publish(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scenarios"] }),
  });

  return { draft, publication, reverseGeocoding };
}
