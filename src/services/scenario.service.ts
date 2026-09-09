import { ApiRoutes } from "../config/api";
import { ScenarioListSchema, type ScenarioSummary } from "../contracts/call";
import { api } from "../lib/api";

/** Сценарии, на которых можно тренироваться прямо сейчас. */
export async function listScenarios(): Promise<ScenarioSummary[]> {
  const payload = await api.get<unknown>(ApiRoutes.scenarios.list);

  return ScenarioListSchema.parse(payload).scenarios;
}
