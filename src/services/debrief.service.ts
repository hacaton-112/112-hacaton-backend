import { API_CONFIG } from "../config/api";
import {
  CallListSchema,
  DebriefSchema,
  type CallSummary,
  type Debrief,
} from "../contracts/debrief";
import { api } from "../lib/api";

/** Свои проведённые звонки, новые сверху. */
export async function listCalls(): Promise<CallSummary[]> {
  const payload = await api.get<unknown>(API_CONFIG.getCallsUrl());

  return CallListSchema.parse(payload).calls;
}

export async function loadDebrief(trainingSessionId: string): Promise<Debrief> {
  const payload = await api.get<unknown>(
    API_CONFIG.getDebriefUrl(trainingSessionId),
  );

  return DebriefSchema.parse(payload);
}

/**
 * Кусок записи приходит через backend вместе с токеном, поэтому его нельзя
 * просто подставить в `<audio src>`: тег заголовков не шлёт. Забираем байты и
 * отдаём ссылку на объект в памяти.
 */
export async function loadRecordingSegment(url: string): Promise<string> {
  // Backend отдаёт путь вместе с префиксом версии, а базовый адрес его уже
  // содержит: иначе получилось бы `/api/v1/api/v1/...`.
  const audio = await api.getBlob(
    `${API_CONFIG.getBaseUrl()}${url.replace("/api/v1", "")}`,
  );

  return URL.createObjectURL(audio);
}
