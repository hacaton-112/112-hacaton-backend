/**
 * Ключи кэша react-query.
 *
 * Собраны в одном месте, потому что мутации инвалидируют чужие ключи:
 * публикация сценария перечитывает и каталог, и брифинг. Пока ключи писались
 * литералами в каждом хуке, опечатка в инвалидации молча оставляла экран со
 * старыми данными — тайпчек её не ловил.
 */
export const QUERY_KEYS = {
  authSession: (refreshToken: string | null) =>
    ["auth", "session", refreshToken] as const,
  scenarios: () => ["scenarios"] as const,
  scenarioVersion: (scenarioVersionId?: string) =>
    ["scenario-version", scenarioVersionId] as const,
  calls: () => ["calls"] as const,
  debrief: (trainingSessionId?: string) =>
    ["debrief", trainingSessionId] as const,
} as const;

/**
 * Префиксы для инвалидации: react-query сопоставляет ключи по началу массива,
 * поэтому сбросить нужно всё семейство, а не конкретный идентификатор.
 */
export const QUERY_KEY_PREFIXES = {
  scenarios: ["scenarios"] as const,
  scenarioVersion: ["scenario-version"] as const,
} as const;
