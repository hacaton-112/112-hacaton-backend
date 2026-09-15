import { env } from "./env";

export const API_PREFIX = "/api/v1";
const API_WS_BASE_URL = `${env.wsUrl}${API_PREFIX}`;

/** Относительные маршруты Nest API. */
export const API_CONFIG = {
  getLoginUrl: () => `/auth/login`,
  getRefreshUrl: () => `/auth/refresh`,
  getLogoutUrl: () => `/auth/logout`,
  getCurrentUserUrl: () => `/auth/me`,
  getScenariosUrl: () => `/scenarios`,
  getScenarioAssistantDraftUrl: () => `/scenarios/assistant/draft`,
  getScenarioPublishUrl: () => `/scenarios`,
  getScenarioUrl: (scenarioId: string) => `/scenarios/${scenarioId}`,
  getScenarioVersionUrl: (scenarioVersionId: string) =>
    `/scenarios/versions/${scenarioVersionId}`,
  getScenarioVersionsUrl: (scenarioId: string) =>
    `/scenarios/${scenarioId}/versions`,
  getReverseGeocodeUrl: () => `/geocoding/reverse`,
  getCallsUrl: () => `/calls`,
  getDdsExercisesUrl: () => `/dds-exercises`,
  getDdsExerciseUrl: (exerciseId: string) => `/dds-exercises/${exerciseId}`,
  getDdsExerciseTransitionsUrl: (exerciseId: string) =>
    `/dds-exercises/${exerciseId}/transitions`,
  getIncidentCardUrl: (trainingSessionId: string) =>
    `/calls/${trainingSessionId}/incident-card`,
  getDebriefUrl: (trainingSessionId: string) =>
    `/calls/${trainingSessionId}/debrief`,
  getRecordingUrl: (trainingSessionId: string, index: number) =>
    `/calls/${trainingSessionId}/recording/${index}`,
  getVoicePipelineStreamUrl: () => `${API_WS_BASE_URL}/voice-pipeline/stream`,
} as const;
