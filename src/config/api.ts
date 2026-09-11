import { env } from "./env";

const API_PREFIX = "/api/v1";
const API_BASE_URL = `${env.apiUrl}${API_PREFIX}`;
const API_WS_BASE_URL = `${env.wsUrl}${API_PREFIX}`;

/** Полные URL маршрутов Nest API. */
export const API_CONFIG = {
  getBaseUrl: () => API_BASE_URL,
  getLoginUrl: () => `${API_BASE_URL}/auth/login`,
  getRefreshUrl: () => `${API_BASE_URL}/auth/refresh`,
  getLogoutUrl: () => `${API_BASE_URL}/auth/logout`,
  getCurrentUserUrl: () => `${API_BASE_URL}/auth/me`,
  getScenariosUrl: () => `${API_BASE_URL}/scenarios`,
  getCallsUrl: () => `${API_BASE_URL}/calls`,
  getIncidentCardUrl: (trainingSessionId: string) =>
    `${API_BASE_URL}/calls/${trainingSessionId}/incident-card`,
  getDebriefUrl: (trainingSessionId: string) =>
    `${API_BASE_URL}/calls/${trainingSessionId}/debrief`,
  getRecordingUrl: (trainingSessionId: string, index: number) =>
    `${API_BASE_URL}/calls/${trainingSessionId}/recording/${index}`,
  getVoicePipelineStreamUrl: () => `${API_WS_BASE_URL}/voice-pipeline/stream`,
} as const;
