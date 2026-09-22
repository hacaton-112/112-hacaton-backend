import { API_CONFIG } from "../config/api";
import {
  BrowserPhoneConfigSchema,
  type BrowserPhoneConfig,
  CrewCallCommandSchema,
  type CrewCallCommand,
  type TelephonyWorkstation,
  TelephonyWorkstationListSchema,
} from "../contracts/telephony";
import { api } from "../lib/api";

export const telephonyService = {
  async getBrowserPhoneConfig(): Promise<BrowserPhoneConfig> {
    const payload = await api.get<unknown>(
      API_CONFIG.getBrowserPhoneConfigUrl(),
    );
    return BrowserPhoneConfigSchema.parse(payload);
  },

  async startCrewCall(
    exerciseId: string,
    input: { eventId: string; dialedNumber: string },
  ): Promise<CrewCallCommand> {
    const payload = await api.post<unknown>(
      API_CONFIG.getDdsCrewCallUrl(exerciseId),
      input,
    );
    return CrewCallCommandSchema.parse(payload);
  },

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
