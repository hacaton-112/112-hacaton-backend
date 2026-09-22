import { env } from "./env";

export const API_PREFIX = "/api/v1";
const API_WS_BASE_URL = `${env.wsUrl}${API_PREFIX}`;

/** Относительные маршруты Nest API. */
export const API_CONFIG = {
  getVoiceRuntimeUrl: () => `/instructor/voice-runtime`,
  getLoginUrl: () => `/auth/login`,
  getRefreshUrl: () => `/auth/refresh`,
  getLogoutUrl: () => `/auth/logout`,
  getCurrentUserUrl: () => `/auth/me`,
  getMethodicalMaterialsUrl: () => `/methodical-materials`,
  getMethodicalSectionCompletionUrl: (materialId: string, sectionId: string) =>
    `/methodical-materials/${encodeURIComponent(materialId)}/sections/${encodeURIComponent(sectionId)}/completion`,
  getScenariosUrl: () => `/scenarios`,
  getTrainingGroupsUrl: () => `/groups`,
  getTrainingGroupUrl: (groupId: string) => `/groups/${groupId}`,
  getGroupStudentsUrl: (groupId: string) => `/groups/${groupId}/students`,
  getStudentsUrl: () => `/instructor/students`,
  getStudentProfileUrl: (userId: string) => `/instructor/students/${userId}`,
  getUsersUrl: () => `/users`,
  getUserUrl: (userId: string) => `/users/${userId}`,
  getTrainingOperatorsUrl: () => `/groups/operators`,
  getTrainingGroupMembersUrl: (groupId: string) => `/groups/${groupId}/members`,
  getTrainingGroupMemberUrl: (groupId: string, userId: string) =>
    `/groups/${groupId}/members/${userId}`,
  getTrainingAssignmentsUrl: () => `/assignments`,
  getMyTrainingAssignmentsUrl: () => `/assignments/my`,
  getTrainingAssignmentUrl: (assignmentId: string) =>
    `/assignments/${assignmentId}`,
  getLaunchAssignmentUrl: (assignmentId: string) =>
    `/assignments/${assignmentId}/launch`,
  getCompleteAssignmentUrl: (assignmentId: string) =>
    `/assignments/${assignmentId}/complete`,
  getArchiveAssignmentUrl: (assignmentId: string) =>
    `/assignments/${assignmentId}/archive`,
  getLiveTrainingSessionsUrl: () => `/instructor/live-sessions`,
  getInstructorCallsUrl: () => `/instructor/calls`,
  getEndTrainingSessionUrl: (trainingSessionId: string) =>
    `/instructor/sessions/${trainingSessionId}/end`,
  getInstructorDebriefUrl: (trainingSessionId: string) =>
    `/instructor/calls/${encodeURIComponent(trainingSessionId)}/debrief`,
  getInstructorReportUrl: () => `/instructor/reports`,
  getInstructorReportExportUrl: () => `/instructor/reports/export`,
  getScenarioAssistantDraftUrl: () => `/scenarios/assistant/draft`,
  getScenarioGenerationJobsUrl: () => `/scenarios/assistant/jobs`,
  getScenarioGenerationJobUrl: (jobId: string) =>
    `/scenarios/assistant/jobs/${encodeURIComponent(jobId)}`,
  getScenarioPublishUrl: () => `/scenarios`,
  getScenarioGrammarCheckUrl: () => `/scenarios/grammar-check`,
  getScenarioUrl: (scenarioId: string) => `/scenarios/${scenarioId}`,
  getScenarioVersionUrl: (scenarioVersionId: string) =>
    `/scenarios/versions/${scenarioVersionId}`,
  getScenarioVersionsUrl: (scenarioId: string) =>
    `/scenarios/${scenarioId}/versions`,
  getReverseGeocodeUrl: () => `/geocoding/reverse`,
  getClassifierVersionsUrl: () => `/classifiers/versions`,
  getClassifierImportUrl: () => `/classifiers/versions/import`,
  getClassifierActivationUrl: (versionId: string) =>
    `/classifiers/versions/${versionId}/activate`,
  getActiveClassifierTreeUrl: () => `/classifiers/active/tree`,
  getActiveClassifierRouteUrl: () => `/classifiers/active/route`,
  getCallsUrl: () => `/calls`,
  getDdsExercisesUrl: () => `/dds-exercises`,
  getDdsAssignmentStartUrl: (assignmentId: string) =>
    `/dds-training/assignments/${encodeURIComponent(assignmentId)}/start`,
  getDdsTrainingAttemptsUrl: () => `/dds-training/attempts`,
  getDdsTrainingLiveUrl: () => `/dds-training/live`,
  getDdsTrainingReviewUrl: (exerciseId: string) =>
    `/dds-training/attempts/${encodeURIComponent(exerciseId)}/reviews`,
  getDdsTrainingStopUrl: (exerciseId: string) =>
    `/dds-training/attempts/${encodeURIComponent(exerciseId)}/stop`,
  getDdsLessonsUrl: () => `/dds-lessons`,
  getMyActiveDdsLessonsUrl: () => `/dds-lessons/my/active`,
  getDdsLessonUrl: (lessonId: string) =>
    `/dds-lessons/${encodeURIComponent(lessonId)}`,
  getDdsLessonNextUrl: (lessonId: string) =>
    `/dds-lessons/${encodeURIComponent(lessonId)}/next`,
  getDdsLessonFinishUrl: (lessonId: string) =>
    `/dds-lessons/${encodeURIComponent(lessonId)}/finish`,
  getDdsLessonReportUrl: (lessonId: string) =>
    `/dds/lessons/${encodeURIComponent(lessonId)}/report`,
  getDdsLessonReportExportUrl: (lessonId: string) =>
    `/dds/lessons/${encodeURIComponent(lessonId)}/report/export`,
  getDdsLessonInsightsRetryUrl: (lessonId: string) =>
    `/dds/lessons/${encodeURIComponent(lessonId)}/insights/retry`,
  getMyDdsResultsUrl: () => `/dds/my/results`,
  getMyDdsResultUrl: (exerciseId: string) =>
    `/dds/my/results/${encodeURIComponent(exerciseId)}`,
  getDdsScenarioReferenceUrl: (versionId: string) =>
    `/dds/references/scenarios/${encodeURIComponent(versionId)}`,
  getDdsScenarioReferenceRegenerateUrl: (versionId: string) =>
    `/dds/references/scenarios/${encodeURIComponent(versionId)}/regenerate`,
  getDdsReferencesUrl: () => `/dds/references`,
  getDdsReferencesApproveUrl: () => `/dds/references/approve`,
  getDdsReferencesRegenerateUrl: () => `/dds/references/regenerate`,
  getDdsTextEvaluationRetryUrl: (exerciseId: string) =>
    `/dds-references/exercises/${encodeURIComponent(exerciseId)}/retry`,
  getAdminQueuesUrl: () => `/admin/queues`,
  getTelephonyWorkstationsUrl: () => `/telephony/workstations`,
  getTelephonyWorkstationUrl: (extension: string) =>
    `/telephony/workstations/${encodeURIComponent(extension)}`,
  getBrowserPhoneConfigUrl: () => `/telephony/browser-phone/config`,
  getDdsCrewCallUrl: (exerciseId: string) =>
    `/telephony/exercises/${encodeURIComponent(exerciseId)}/crew-calls`,
  getDdsExerciseUrl: (exerciseId: string) => `/dds-exercises/${exerciseId}`,
  getDdsExerciseTransitionsUrl: (exerciseId: string) =>
    `/dds-exercises/${exerciseId}/transitions`,
  getIncidentCardUrl: (trainingSessionId: string) =>
    `/calls/${trainingSessionId}/incident-card`,
  getIncidentCardDispatchUrl: (trainingSessionId: string) =>
    `/calls/${trainingSessionId}/incident-card/dispatch`,
  getDebriefUrl: (trainingSessionId: string) =>
    `/calls/${trainingSessionId}/debrief`,
  getRecordingUrl: (trainingSessionId: string, index: number) =>
    `/calls/${trainingSessionId}/recording/${index}`,
  getVoicePipelineStreamUrl: () => `${API_WS_BASE_URL}/voice-pipeline/stream`,
} as const;
