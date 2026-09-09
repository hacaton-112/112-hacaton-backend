import { env } from "./env";

const API_PREFIX = "/api/v1";
const API_BASE_URL = `${env.apiUrl}${API_PREFIX}`;
const API_WS_BASE_URL = `${env.wsUrl}${API_PREFIX}`;

/** Полные URL маршрутов Nest API. */
export const API_CONFIG = {
  getBaseUrl: () => API_BASE_URL,
  getLoginUrl: () => `${API_BASE_URL}/auth/login`,
  getCurrentUserUrl: () => `${API_BASE_URL}/auth/me`,
  getScenariosUrl: () => `${API_BASE_URL}/scenarios`,
  getVoicePipelineStreamUrl: () => `${API_WS_BASE_URL}/voice-pipeline/stream`,
} as const;
