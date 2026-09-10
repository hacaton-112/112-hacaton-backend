import { API_CONFIG } from "../config/api";
import { IncidentCardSchema, type IncidentCard } from "../contracts/incident";
import { api } from "../lib/api";

/**
 * Карточка живёт на стороне backend и принадлежит звонку: один звонок — одна
 * карточка, править её можно, пока разговор идёт.
 */
export async function loadIncidentCard(
  trainingSessionId: string,
): Promise<IncidentCard> {
  const payload = await api.get<unknown>(
    API_CONFIG.getIncidentCardUrl(trainingSessionId),
  );

  // Backend отдаёт больше полей, чем показывает окно: берём только свои.
  return IncidentCardSchema.parse(payload);
}

export async function saveIncidentCard(
  trainingSessionId: string,
  card: IncidentCard,
): Promise<void> {
  await api.put<unknown>(
    API_CONFIG.getIncidentCardUrl(trainingSessionId),
    card,
  );
}
