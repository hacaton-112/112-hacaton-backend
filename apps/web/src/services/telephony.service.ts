import { API_CONFIG } from "../config/api";
import {
  BrowserPhoneConfigSchema,
  type BrowserPhoneConfig,
  CrewCallCommandSchema,
  type CrewCallCommand,
  type TelephonyWorkstation,
  TelephonyWorkstationListSchema,
  WorkstationImportReportSchema,
} from "../contracts/telephony";
import { api } from "../lib/api";
import { saveReportBlob } from "./report-download";

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

  async exportWorkstations(format: "xml" | "csv"): Promise<void> {
    const response = await api.getDownload(
      API_CONFIG.getAdminWorkstationsExportUrl(),
      { params: { format } },
    );
    saveReportBlob(response.blob, `workstations.${format}`);
  },

  async importWorkstations(
    format: "xml" | "csv",
    content: string,
    dryRun: boolean,
  ) {
    return WorkstationImportReportSchema.parse(
      await api.post<unknown>(API_CONFIG.getAdminWorkstationsImportUrl(), {
        format,
        content,
        dryRun,
      }),
    );
  },
};
