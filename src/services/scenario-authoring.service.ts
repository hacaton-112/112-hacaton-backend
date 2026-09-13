import { API_CONFIG } from "../config/api";
import {
  GenerateScenarioDraftResponseSchema,
  PublishedScenarioSchema,
  type GenerateScenarioDraftResponse,
  type PublishedScenario,
  type ScenarioSeed,
} from "../contracts/scenario-authoring";
import { api } from "../lib/api";

export type ScenarioAuthoringSource = "manual" | "assistant";

export const scenarioAuthoringService = {
  async generateDraft(brief: string): Promise<GenerateScenarioDraftResponse> {
    const payload = await api.post<unknown>(
      API_CONFIG.getScenarioAssistantDraftUrl(),
      { brief },
      // Scenario generation is not part of the realtime call loop and may take
      // longer than an ordinary REST request.
      { timeout: 60_000 },
    );

    return GenerateScenarioDraftResponseSchema.parse(payload);
  },

  async publish(input: {
    scenario: ScenarioSeed;
    authoringSource: ScenarioAuthoringSource;
    authoringPrompt?: string;
  }): Promise<PublishedScenario> {
    const payload = await api.post<unknown>(
      API_CONFIG.getScenarioPublishUrl(),
      input,
    );

    return PublishedScenarioSchema.parse(payload);
  },
};
