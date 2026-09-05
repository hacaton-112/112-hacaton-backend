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
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
