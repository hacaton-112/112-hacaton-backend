import { useQuery } from "@tanstack/react-query";

import { scenarioService } from "../services/scenario.service";

export function useScenarios() {
  return useQuery({
    queryKey: ["scenarios"],
    queryFn: scenarioService.list,
  });
}
