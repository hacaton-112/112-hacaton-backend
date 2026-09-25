import { API_CONFIG } from "../config/api";
import {
  DdsExerciseListSchema,
  DdsExerciseSchema,
  type DdsExercise,
  type DdsResponseStatus,
} from "../contracts/dds-exercise";
import { api } from "../lib/api";

export const ddsExerciseService = {
  async list(): Promise<DdsExercise[]> {
    const payload = await api.get<unknown>(API_CONFIG.getDdsExercisesUrl());
    return DdsExerciseListSchema.parse(payload).exercises;
  },

  async transition(
    exerciseId: string,
    status: Exclude<DdsResponseStatus, "pending" | "lesson_finished">,
    comment?: string,
  ): Promise<DdsExercise> {
    const payload = await api.post<unknown>(
      API_CONFIG.getDdsExerciseTransitionsUrl(exerciseId),
      {
        eventId: crypto.randomUUID(),
        status,
        ...(comment?.trim() ? { comment: comment.trim() } : {}),
      },
    );
    return DdsExerciseSchema.parse(payload);
  },
};
