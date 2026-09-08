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
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
