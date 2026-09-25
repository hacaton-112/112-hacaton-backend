import { API_CONFIG } from "../config/api";
import {
  DdsArchivePageSchema,
  type DdsArchiveFilter,
} from "../contracts/dds-archive";
import { api } from "../lib/api";

/**
 * Пустые поля в запрос не уходят.
 *
 * Сервер принимает только заполненные фильтры, и `status=` без значения он
 * отвергнет целиком, хотя для пользователя это просто «фильтр не выбран».
 */
const filledParams = (filter: DdsArchiveFilter): Record<string, string> =>
  Object.fromEntries(
    Object.entries(filter)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  );

export const ddsArchiveService = {
  async search(filter: DdsArchiveFilter) {
    return DdsArchivePageSchema.parse(
      await api.get<unknown>(API_CONFIG.getDdsArchiveUrl(), {
        params: filledParams(filter),
      }),
    );
  },
};
