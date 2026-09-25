import { API_CONFIG } from "../config/api";
import {
  ActiveClassifierTreeSchema,
  ClassifierVersionListSchema,
  ClassifierVersionSchema,
  RouteClassifierResponseSchema,
  type ActiveClassifierTree,
  type ClassifierVersion,
  type RouteClassifierResponse,
} from "../contracts/classifier";
import { api } from "../lib/api";

export interface ClassifierRouteInput {
  entryId: string;
  qualifierCodes: readonly string[];
  signal?: AbortSignal;
}

export const classifierService = {
  async listVersions(): Promise<readonly ClassifierVersion[]> {
    const payload = await api.get<unknown>(
      API_CONFIG.getClassifierVersionsUrl(),
    );
    return ClassifierVersionListSchema.parse(payload).versions;
  },

  async importVersion(file: File): Promise<ClassifierVersion> {
    const body = new FormData();
    body.append("file", file);
    const payload = await api.post<unknown>(
      API_CONFIG.getClassifierImportUrl(),
      body,
      {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60_000,
      },
    );
    return ClassifierVersionSchema.parse(payload);
  },

  async activateVersion(versionId: string): Promise<ClassifierVersion> {
    const payload = await api.post<unknown>(
      API_CONFIG.getClassifierActivationUrl(versionId),
    );
    return ClassifierVersionSchema.parse(payload);
  },

  async loadActiveTree(): Promise<ActiveClassifierTree> {
    const payload = await api.get<unknown>(
      API_CONFIG.getActiveClassifierTreeUrl(),
    );
    return ActiveClassifierTreeSchema.parse(payload);
  },

  async route({
    entryId,
    qualifierCodes,
    signal,
  }: ClassifierRouteInput): Promise<RouteClassifierResponse> {
    const payload = await api.post<unknown>(
      API_CONFIG.getActiveClassifierRouteUrl(),
      { entryId, qualifierCodes },
      { signal },
    );
    return RouteClassifierResponseSchema.parse(payload);
  },
};
