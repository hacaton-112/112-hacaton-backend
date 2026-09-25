import { API_CONFIG } from "../config/api";
import {
  IncidentCardDispatchReceiptSchema,
  IncidentCardSchema,
  type IncidentCard,
  type IncidentCardDispatchReceipt,
} from "../contracts/incident";
import { api } from "../lib/api";

export const incidentCardService = {
  /**
   * Карточка живёт на стороне backend и принадлежит звонку: один звонок — одна
   * карточка, править её можно, пока разговор идёт.
   */
  async loadIncidentCard(trainingSessionId: string): Promise<IncidentCard> {
    const payload = await api.get<unknown>(
      API_CONFIG.getIncidentCardUrl(trainingSessionId),
    );

    // Backend отдаёт больше полей, чем показывает окно: берём только свои.
    return IncidentCardSchema.parse(payload);
  },

  async saveIncidentCard(
    trainingSessionId: string,
    card: IncidentCard,
  ): Promise<IncidentCard> {
    const {
      classifierRouting: _serverOwned,
      submittedAt: _submittedAt,
      ...body
    } = card;
    const payload = await api.put<unknown>(
      API_CONFIG.getIncidentCardUrl(trainingSessionId),
      body,
    );

    return IncidentCardSchema.parse(payload);
  },

  async dispatchIncidentCard(
    trainingSessionId: string,
    eventId: string,
  ): Promise<IncidentCardDispatchReceipt> {
    const payload = await api.post<unknown>(
      API_CONFIG.getIncidentCardDispatchUrl(trainingSessionId),
      { eventId },
    );

    return IncidentCardDispatchReceiptSchema.parse(payload);
  },
};
