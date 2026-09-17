import { API_CONFIG } from "../config/api";
import {
  InstructorReportSchema,
  type InstructorReportFilters,
  type ReportFormat,
} from "../contracts/reports";
import { api } from "../lib/api";

import {
  filenameFromContentDisposition,
  reportRequestParams,
  saveReportBlob,
} from "./report-download";

const REPORT_TIMEOUT_MS = 30_000;

export const reportsService = {
  async get(filters: InstructorReportFilters) {
    return InstructorReportSchema.parse(
      await api.get<unknown>(API_CONFIG.getInstructorReportUrl(), {
        params: reportRequestParams(filters),
        timeout: REPORT_TIMEOUT_MS,
      }),
    );
  },

  async download(filters: InstructorReportFilters, format: ReportFormat) {
    const response = await api.getDownload(
      API_CONFIG.getInstructorReportExportUrl(),
      {
        params: reportRequestParams(filters, format),
        timeout: REPORT_TIMEOUT_MS,
      },
    );
    const filename =
      filenameFromContentDisposition(response.contentDisposition) ??
      `instructor-report.${format}`;
    saveReportBlob(response.blob, filename);
    return filename;
  },
};
