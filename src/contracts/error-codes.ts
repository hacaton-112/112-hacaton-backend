/**
 * Application error codes for i18n support.
 * Frontend uses these codes to display localized error messages.
 *
 * Convention: DOMAIN_ACTION_REASON
 * Example: USER_CREATE_EMAIL_EXISTS
 */
export const ErrorCodes = {
  // ── Common ─────────────────────────────────────────────────
  VALIDATION_FAILED: "VALIDATION_FAILED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  DATABASE_ERROR: "DATABASE_ERROR",
  DUPLICATE_ENTRY: "DUPLICATE_ENTRY",

  // ── Auth ───────────────────────────────────────────────────
  AUTH_LOGIN_INVALID_CREDENTIALS: "AUTH_LOGIN_INVALID_CREDENTIALS",
  AUTH_EMAIL_ALREADY_EXISTS: "AUTH_EMAIL_ALREADY_EXISTS",
  AUTH_TOKEN_INVALID: "AUTH_TOKEN_INVALID",
  // One code for every refresh failure — unknown, expired, revoked or replayed.
  // A distinguishable reason only helps an attacker probe tokens.
  AUTH_REFRESH_TOKEN_INVALID: "AUTH_REFRESH_TOKEN_INVALID",
  AUTH_USER_NOT_FOUND: "AUTH_USER_NOT_FOUND",
  AUTH_ROLE_FORBIDDEN: "AUTH_ROLE_FORBIDDEN",

  // ── Конструктор сценариев ──────────────────────────────────
  SCENARIO_CODE_EXISTS: "SCENARIO_CODE_EXISTS",
  SCENARIO_PERSONA_CODE_EXISTS: "SCENARIO_PERSONA_CODE_EXISTS",
  SCENARIO_ASSISTANT_UNAVAILABLE: "SCENARIO_ASSISTANT_UNAVAILABLE",
  SCENARIO_ASSISTANT_INVALID_DRAFT: "SCENARIO_ASSISTANT_INVALID_DRAFT",
  SCENARIO_NOT_FOUND: "SCENARIO_NOT_FOUND",
  SCENARIO_VERSION_NOT_FOUND: "SCENARIO_VERSION_NOT_FOUND",
  // Пока преподаватель правил, опубликована более новая версия: его правка
  // затёрла бы чужую.
  SCENARIO_VERSION_STALE: "SCENARIO_VERSION_STALE",
  SCENARIO_CODE_IMMUTABLE: "SCENARIO_CODE_IMMUTABLE",

  // ── Геокодирование ─────────────────────────────────────────
  GEOCODING_ADDRESS_NOT_FOUND: "GEOCODING_ADDRESS_NOT_FOUND",
  GEOCODING_UNAVAILABLE: "GEOCODING_UNAVAILABLE",
  GEOCODING_CALL_NOT_ACTIVE: "GEOCODING_CALL_NOT_ACTIVE",

  // ── Учебный звонок ─────────────────────────────────────────
  // Чужой звонок неотличим от несуществующего: знать чужие идентификаторы
  // сессий оператору незачем.
  CALL_NOT_FOUND: "CALL_NOT_FOUND",
  INCIDENT_CARD_CLOSED: "INCIDENT_CARD_CLOSED",
  RECORDING_NOT_FOUND: "RECORDING_NOT_FOUND",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
