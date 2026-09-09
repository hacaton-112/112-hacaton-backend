import { API_CONFIG } from "../config/api";
import { ScenarioListSchema, type ScenarioSummary } from "../contracts/call";
import { api } from "../lib/api";

/** Сценарии, на которых можно тренироваться прямо сейчас. */
export const scenarioService = {
  async list(): Promise<ScenarioSummary[]> {
    const payload = await api.get<unknown>(API_CONFIG.getScenariosUrl());

    return ScenarioListSchema.parse(payload).scenarios;
  },
};
