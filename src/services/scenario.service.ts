import { API_CONFIG } from "../config/api";
import { ScenarioListSchema, type ScenarioSummary } from "../contracts/call";
import { ScenarioImportReportSchema } from "../contracts/scenario-authoring";
import { api } from "../lib/api";
import {
  filenameFromContentDisposition,
  saveReportBlob,
} from "./report-download";

/** Сценарии, на которых можно тренироваться прямо сейчас. */
export const scenarioService = {
  async list(): Promise<ScenarioSummary[]> {
    const payload = await api.get<unknown>(API_CONFIG.getScenariosUrl());

    return ScenarioListSchema.parse(payload).scenarios;
  },

  async exportPackage(ids: readonly string[]) {
    const response = await api.getDownload(API_CONFIG.getScenarioExportUrl(), {
      params: ids.length === 0 ? undefined : { ids: ids.join(",") },
    });
    const filename =
      filenameFromContentDisposition(response.contentDisposition) ??
      "scenarios.json";
    saveReportBlob(response.blob, filename);
    return filename;
  },

  async importPackage(packageData: unknown, dryRun: boolean) {
    const body =
      packageData !== null && typeof packageData === "object"
        ? { ...packageData, dryRun }
        : { dryRun };
    return ScenarioImportReportSchema.parse(
      await api.post<unknown>(API_CONFIG.getScenarioImportUrl(), body),
    );
  },
};
