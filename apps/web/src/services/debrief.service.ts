import { API_CONFIG } from "../config/api";
import {
  CallListSchema,
  DebriefSchema,
  type CallSummary,
  type Debrief,
} from "../contracts/debrief";
import { api } from "../lib/api";

export const debriefService = {
  /** Свои проведённые звонки, новые сверху. */
  async listCalls(): Promise<CallSummary[]> {
    const payload = await api.get<unknown>(API_CONFIG.getCallsUrl());

    return CallListSchema.parse(payload).calls;
  },

  /**
   * Преподаватель открывает разбор обучающегося своей группы отдельным
   * маршрутом: доступ к нему проверяется по группе, а не по владельцу звонка.
   */
  async loadDebrief(
    trainingSessionId: string,
    asReviewer = false,
  ): Promise<Debrief> {
    const payload = await api.get<unknown>(
      asReviewer
        ? API_CONFIG.getInstructorDebriefUrl(trainingSessionId)
        : API_CONFIG.getDebriefUrl(trainingSessionId),
    );

    return DebriefSchema.parse(payload);
  },

  /**
   * Кусок записи приходит через backend вместе с токеном, поэтому его нельзя
   * просто подставить в `<audio src>`: тег заголовков не шлёт. Забираем байты и
   * отдаём ссылку на объект в памяти.
   */
  async loadRecordingSegment(url: string): Promise<string> {
    // Backend может вернуть путь уже с API-префиксом; клиент нормализует его.
    const audio = await api.getBlob(url);

    return URL.createObjectURL(audio);
  },
};
