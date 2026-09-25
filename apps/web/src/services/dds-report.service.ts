import { API_CONFIG } from "../config/api";
import {
  DdsLessonReportSchema,
  DdsMyResultSchema,
  DdsMyResultsSchema,
  type DdsReportFormat,
} from "../contracts/dds-report";
import { api } from "../lib/api";

import {
  filenameFromContentDisposition,
  saveReportBlob,
} from "./report-download";

const REPORT_TIMEOUT_MS = 30_000;

export const ddsReportService = {
  async getLesson(lessonId: string) {
    return DdsLessonReportSchema.parse(
      await api.get<unknown>(API_CONFIG.getDdsLessonReportUrl(lessonId), {
        timeout: REPORT_TIMEOUT_MS,
      }),
    );
  },

  async retryInsights(lessonId: string) {
    await api.post(API_CONFIG.getDdsLessonInsightsRetryUrl(lessonId));
  },

  async getMyResults() {
    return DdsMyResultsSchema.parse(
      await api.get<unknown>(API_CONFIG.getMyDdsResultsUrl()),
    );
  },

  async getMyResult(exerciseId: string) {
    return DdsMyResultSchema.parse(
      await api.get<unknown>(API_CONFIG.getMyDdsResultUrl(exerciseId)),
    );
  },

  async download(lessonId: string, format: DdsReportFormat) {
    const response = await api.getDownload(
      API_CONFIG.getDdsLessonReportExportUrl(lessonId),
      { params: { format }, timeout: REPORT_TIMEOUT_MS },
    );
    const filename =
      filenameFromContentDisposition(response.contentDisposition) ??
      `dds-lesson-report.${format}`;
    saveReportBlob(response.blob, filename);
    return filename;
  },
};
