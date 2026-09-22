import { API_CONFIG } from "../config/api";
import {
  DdsCardReferenceSchema,
  type DdsCardReference,
} from "../contracts/dds-reference";
import { api } from "../lib/api";

export const ddsReferenceService = {
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
