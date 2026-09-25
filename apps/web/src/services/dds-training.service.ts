import { API_CONFIG } from "../config/api";
import { DdsExerciseSchema } from "../contracts/dds-exercise";
import {
  DdsLiveListSchema,
  DdsTrainingListSchema,
  DdsReviewRequestSchema,
  type DdsReviewRequest,
} from "../contracts/dds-training";
import { api } from "../lib/api";

export const ddsTrainingService = {
  async start(assignmentId: string, eventId: string) {
    return DdsExerciseSchema.parse(
      await api.post<unknown>(
        API_CONFIG.getDdsAssignmentStartUrl(assignmentId),
        { eventId },
      ),
    );
  },
  async live(
    signal?: AbortSignal,
    filters?: { groupId?: string; lessonId?: string },
  ) {
    return DdsLiveListSchema.parse(
      await api.get<unknown>(API_CONFIG.getDdsTrainingLiveUrl(), {
        signal,
        params: filters,
      }),
    );
  },
  async list() {
    return DdsTrainingListSchema.parse(
      await api.get<unknown>(API_CONFIG.getDdsTrainingAttemptsUrl()),
    );
  },
  async review(exerciseId: string, input: DdsReviewRequest) {
    await api.post(
      API_CONFIG.getDdsTrainingReviewUrl(exerciseId),
      DdsReviewRequestSchema.parse(input),
    );
  },
  async stop(exerciseId: string, reason: string) {
    await api.post(API_CONFIG.getDdsTrainingStopUrl(exerciseId), { reason });
  },
};
