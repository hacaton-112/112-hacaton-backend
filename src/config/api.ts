import { env } from "./env";

/** Backend mounts every route under the versioned prefix (see main.ts). */
export const API_PREFIX = "/api/v1";

export const API_BASE_URL = `${env.apiUrl}${API_PREFIX}`;
export const API_WS_BASE_URL = `${env.wsUrl}${API_PREFIX}`;

/** Paths are relative to `API_BASE_URL`; WebSocket ones are absolute. */
export const ApiRoutes = {
  auth: {
    login: "/auth/login",
    me: "/auth/me",
  },
  scenarios: {
    list: "/scenarios",
  },
  voicePipeline: {
    stream: `${API_WS_BASE_URL}/voice-pipeline/stream`,
  },
} as const;
