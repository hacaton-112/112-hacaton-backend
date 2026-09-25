import { API_CONFIG } from "../config/api";
import {
  DdsCardReferenceSchema,
  DdsReferenceBulkResultSchema,
  DdsReferenceListSchema,
  type DdsCardReference,
  type DdsReferenceStatus,
} from "../contracts/dds-reference";
import { api } from "../lib/api";

export const ddsReferenceService = {
  async list(filters: {
    status?: DdsReferenceStatus;
    page: number;
    pageSize: number;
  }) {
    const query = new URLSearchParams({
      page: String(filters.page),
      pageSize: String(filters.pageSize),
    });
    if (filters.status) query.set("status", filters.status);
    return DdsReferenceListSchema.parse(
      await api.get<unknown>(`${API_CONFIG.getDdsReferencesUrl()}?${query}`),
    );
  },
  async approveMany(scenarioVersionIds: string[]) {
    return DdsReferenceBulkResultSchema.parse(
      await api.post<unknown>(API_CONFIG.getDdsReferencesApproveUrl(), {
        scenarioVersionIds,
      }),
    );
  },
  async regenerateMany(scenarioVersionIds: string[]) {
    return DdsReferenceBulkResultSchema.parse(
      await api.post<unknown>(API_CONFIG.getDdsReferencesRegenerateUrl(), {
        scenarioVersionIds,
      }),
    );
  },
  async get(versionId: string) {
    return DdsCardReferenceSchema.parse(
      await api.get<unknown>(API_CONFIG.getDdsScenarioReferenceUrl(versionId)),
    );
  },
  async update(
    versionId: string,
    reference: DdsCardReference,
    approveAll = false,
  ) {
    return DdsCardReferenceSchema.parse(
      await api.put<unknown>(API_CONFIG.getDdsScenarioReferenceUrl(versionId), {
        eventId: crypto.randomUUID(),
        expectedOutcome: reference.expectedOutcome,
        refusalReasons: reference.refusalReasons,
        requiredItems: reference.requiredItems,
        expectedCrewService: reference.expectedCrewService,
        approveAll,
      }),
    );
  },
  async regenerate(versionId: string, comment: string) {
    return DdsCardReferenceSchema.parse(
      await api.post<unknown>(
        API_CONFIG.getDdsScenarioReferenceRegenerateUrl(versionId),
        { eventId: crypto.randomUUID(), comment },
      ),
    );
  },
  async retry(exerciseId: string) {
    await api.post(API_CONFIG.getDdsTextEvaluationRetryUrl(exerciseId));
  },
};
