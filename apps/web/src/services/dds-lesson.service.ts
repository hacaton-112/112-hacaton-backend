import { API_CONFIG } from "../config/api";
import {
  ActiveDdsLessonListSchema,
  CreateDdsLessonSchema,
  DdsLessonListSchema,
  DdsLessonSchema,
  NextDdsLessonCardResponseSchema,
  type CreateDdsLesson,
} from "../contracts/dds-lesson";
import { api } from "../lib/api";

export const ddsLessonService = {
  async create(input: CreateDdsLesson) {
    return DdsLessonSchema.parse(
      await api.post<unknown>(
        API_CONFIG.getDdsLessonsUrl(),
        CreateDdsLessonSchema.parse(input),
      ),
    );
  },
  async list() {
    return DdsLessonListSchema.parse(
      await api.get<unknown>(API_CONFIG.getDdsLessonsUrl()),
    ).lessons;
  },
  async myActive() {
    return ActiveDdsLessonListSchema.parse(
      await api.get<unknown>(API_CONFIG.getMyActiveDdsLessonsUrl()),
    ).lessons;
  },
  async next(lessonId: string, eventId: string) {
    return NextDdsLessonCardResponseSchema.parse(
      await api.post<unknown>(API_CONFIG.getDdsLessonNextUrl(lessonId), {
        eventId,
      }),
    );
  },
  async finish(lessonId: string, eventId: string) {
    return DdsLessonSchema.parse(
      await api.post<unknown>(API_CONFIG.getDdsLessonFinishUrl(lessonId), {
        eventId,
      }),
    );
  },
};
