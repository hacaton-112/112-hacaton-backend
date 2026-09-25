export const CREW_CALL_PURPOSES = ["handoff", "progress_check"] as const;

export type CrewCallPurpose = (typeof CREW_CALL_PURPOSES)[number];

export const CREW_PROGRESS_REPORT_STATUSES = [
  "arrived",
  "working",
  "completed",
] as const;

export type CrewProgressReportStatus =
  (typeof CREW_PROGRESS_REPORT_STATUSES)[number];

export const isCrewCallPurpose = (value: string): value is CrewCallPurpose =>
  CREW_CALL_PURPOSES.includes(value as CrewCallPurpose);

export const isCrewProgressReportStatus = (
  value: string,
): value is CrewProgressReportStatus =>
  CREW_PROGRESS_REPORT_STATUSES.includes(value as CrewProgressReportStatus);
