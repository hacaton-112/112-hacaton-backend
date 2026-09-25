/**
 * Ключи кэша react-query.
 *
 * Собраны в одном месте, потому что мутации инвалидируют чужие ключи:
 * публикация сценария перечитывает и каталог, и брифинг. Пока ключи писались
 * литералами в каждом хуке, опечатка в инвалидации молча оставляла экран со
 * старыми данными — тайпчек её не ловил.
 */
export const QUERY_KEYS = {
  voiceRuntime: () => ["voice-runtime"] as const,
  ddsLiveAttempts: () => ["dds-live-attempts"] as const,
  ddsLessons: () => ["dds-lessons"] as const,
  activeDdsLessons: () => ["dds-lessons", "my", "active"] as const,
  ddsLessonReport: (lessonId?: string) =>
    ["dds-lessons", lessonId, "report"] as const,
  ddsReferences: (filters: object = {}) => ["dds-references", filters] as const,
  adminQueues: () => ["admin-queues"] as const,
  auditLog: (filter: object) => ["audit-log", filter] as const,
  ddsArchive: (filter: object) => ["dds-archive", filter] as const,
  myDdsResults: () => ["dds-results", "my"] as const,
  myDdsResult: (exerciseId?: string) =>
    ["dds-results", "my", exerciseId] as const,
  authSession: (refreshToken: string | null) =>
    ["auth", "session", refreshToken] as const,
  scenarios: () => ["scenarios"] as const,
  scenarioGenerationJobs: () => ["scenario-generation-jobs"] as const,
  scenarioGenerationJob: (jobId?: string) =>
    ["scenario-generation-jobs", jobId] as const,
  trainingGroups: () => ["training-groups"] as const,
  trainingGroup: (groupId: string) => ["training-groups", groupId] as const,
  groupStudents: (groupId: string) =>
    ["training-groups", groupId, "students"] as const,
  students: () => ["students"] as const,
  studentProfile: (userId: string) => ["student-profile", userId] as const,
  trainingOperators: () => ["training-operators"] as const,
  users: (filters: object = {}) => ["users", filters] as const,
  trainingAssignments: () => ["training-assignments"] as const,
  myAssignments: () => ["my-assignments"] as const,
  liveTrainingSessions: (groupId?: string) =>
    ["live-training-sessions", groupId] as const,
  instructorCalls: () => ["instructor-calls"] as const,
  instructorReport: (filters: object | null) =>
    ["instructor-report", filters] as const,
  instructorReadiness: (filters: object | null) =>
    ["instructor-readiness", filters] as const,
  classifierVersions: () => ["classifier", "versions"] as const,
  activeClassifierTree: () => ["classifier", "active", "tree"] as const,
  classifierRoute: (entryId?: string, qualifierCodes: readonly string[] = []) =>
    ["classifier", "route", entryId, ...qualifierCodes] as const,
  scenarioVersion: (scenarioVersionId?: string) =>
    ["scenario-version", scenarioVersionId] as const,
  calls: () => ["calls"] as const,
  debrief: (trainingSessionId?: string) =>
    ["debrief", trainingSessionId] as const,
  methodicalMaterials: () => ["methodical-materials"] as const,
} as const;

/**
 * Префиксы для инвалидации: react-query сопоставляет ключи по началу массива,
 * поэтому сбросить нужно всё семейство, а не конкретный идентификатор.
 */
export const QUERY_KEY_PREFIXES = {
  scenarios: ["scenarios"] as const,
  scenarioVersion: ["scenario-version"] as const,
  users: ["users"] as const,
} as const;
