import { API_CONFIG } from "../config/api";
import {
  GenerateScenarioDraftResponseSchema,
  PublishedScenarioSchema,
  ReverseGeocodedAddressSchema,
  type GenerateScenarioDraftResponse,
  type PublishedScenario,
  type ReverseGeocodedAddress,
  type ScenarioSeed,
} from "../contracts/scenario-authoring";
import { api } from "../lib/api";

export type ScenarioAuthoringSource = "manual" | "assistant";

export const scenarioAuthoringService = {
  async reverseGeocode(input: {
    latitude: number;
    longitude: number;
  }): Promise<ReverseGeocodedAddress> {
    const payload = await api.get<unknown>(API_CONFIG.getReverseGeocodeUrl(), {
      params: input,
      timeout: 15_000,
    });

    return ReverseGeocodedAddressSchema.parse(payload);
  },

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
