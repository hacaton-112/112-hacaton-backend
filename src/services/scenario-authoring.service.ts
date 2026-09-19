import { API_CONFIG } from "../config/api";
import {
  EditableScenarioVersionSchema,
  GenerateScenarioDraftResponseSchema,
  PublishedScenarioSchema,
  ReverseGeocodedAddressSchema,
  type EditableScenarioVersion,
  type GenerateScenarioDraftResponse,
  type PublishedScenario,
  type ReverseGeocodedAddress,
  type ScenarioSeed,
} from "../contracts/scenario-authoring";
import { type GrammarReport, GrammarReportSchema } from "../contracts/grammar";
import { api } from "../lib/api";

export type ScenarioAuthoringSource = "manual" | "assistant";

export interface ScenarioPublicationInput {
  preparationId?: string;
  scenario: ScenarioSeed;
  authoringSource: ScenarioAuthoringSource;
  authoringPrompt?: string;
}

export interface ScenarioVersionPublicationInput extends ScenarioPublicationInput {
  scenarioId: string;
  /** Версия, открытая в редакторе: устаревшую правку backend отклонит. */
  baseVersionId: string;
}

export interface ReverseGeocodeInput {
  latitude: number;
  longitude: number;
  /** Оператор определяет адрес только в рамках своего идущего звонка. */
  trainingSessionId?: string;
}

export const scenarioAuthoringService = {
  async reverseGeocode({
    latitude,
    longitude,
    trainingSessionId,
  }: ReverseGeocodeInput): Promise<ReverseGeocodedAddress> {
    const payload = await api.get<unknown>(API_CONFIG.getReverseGeocodeUrl(), {
      params: {
        latitude,
        longitude,
        ...(trainingSessionId ? { trainingSessionId } : {}),
      },
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

  /**
   * Просит backend прочитать тексты сценария.
   *
   * Черновик уходит как есть: проверку просят после ручной правки, когда
   * сценарий ещё может не сходиться со схемой. Ответ ничего не меняет и не
   * мешает публикации.
   */
  async checkGrammar(scenario: unknown): Promise<GrammarReport> {
    const payload = await api.post<unknown>(
      API_CONFIG.getScenarioGrammarCheckUrl(),
      { scenario },
    );

    return GrammarReportSchema.parse(payload);
  },

  async publish(input: ScenarioPublicationInput): Promise<PublishedScenario> {
    const payload = await api.post<unknown>(
      API_CONFIG.getScenarioPublishUrl(),
      input,
    );

    return PublishedScenarioSchema.parse(payload);
  },

  async loadVersion(
    scenarioVersionId: string,
  ): Promise<EditableScenarioVersion> {
    const payload = await api.get<unknown>(
      API_CONFIG.getScenarioVersionUrl(scenarioVersionId),
    );

    return EditableScenarioVersionSchema.parse(payload);
  },

  /**
   * Удаляет сценарий из каталога. Проведённые по нему звонки и разборы
   * остаются: backend снимает сценарий, а не стирает его версии.
   */
  async archive(scenarioId: string): Promise<void> {
    await api.delete<unknown>(API_CONFIG.getScenarioUrl(scenarioId));
  },

  async publishVersion({
    scenarioId,
    ...body
  }: ScenarioVersionPublicationInput): Promise<PublishedScenario> {
    const payload = await api.post<unknown>(
      API_CONFIG.getScenarioVersionsUrl(scenarioId),
      body,
    );

    return PublishedScenarioSchema.parse(payload);
  },
};
