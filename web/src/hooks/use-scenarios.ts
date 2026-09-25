import { useQuery } from "@tanstack/react-query";

import { QUERY_KEYS } from "../config/query-keys";
import { scenarioService } from "../services/scenario.service";

export function useScenarios() {
  return useQuery({
    queryKey: QUERY_KEYS.scenarios(),
    queryFn: scenarioService.list,
  });
}
