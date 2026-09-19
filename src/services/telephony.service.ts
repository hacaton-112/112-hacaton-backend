import { API_CONFIG } from "../config/api";
import {
  type TelephonyWorkstation,
  TelephonyWorkstationListSchema,
} from "../contracts/telephony";
import { api } from "../lib/api";

export const telephonyService = {
  async listWorkstations(): Promise<TelephonyWorkstation[]> {
    const payload = await api.get<unknown>(
      API_CONFIG.getTelephonyWorkstationsUrl(),
    );
    return TelephonyWorkstationListSchema.parse(payload).workstations;
  },

  async seat(extension: string, userId: string): Promise<void> {
    await api.put(API_CONFIG.getTelephonyWorkstationUrl(extension), {
      userId,
    });
  },

  async free(extension: string): Promise<void> {
    await api.delete(API_CONFIG.getTelephonyWorkstationUrl(extension));
  },
};
