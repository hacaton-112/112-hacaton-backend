import { createHash, randomBytes } from "node:crypto";

/** 256 bits of entropy — 43 characters once base64url encoded. */
const TOKEN_BYTES = 32;

/**
 * Charset and bounds rather than an exact length: junk is rejected before the
 * database is touched, and the token size can change without invalidating the
 * ones already in circulation.
 */
export const REFRESH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,512}$/;

/**
 * An opaque secret, deliberately not a JWT. Verified claims tolerate unknown
 * keys, so a refresh JWT signed with the same secret would be accepted as an
 * access token; an opaque string cannot be confused for one. It also keeps the
 * longest-lived credential on the client free of any personal data.
 */
export const createRefreshToken = (): string =>
  randomBytes(TOKEN_BYTES).toString("base64url");

/**
 * SHA-256 rather than bcrypt: there is no low-entropy guess to slow down, and
 * a deterministic digest can be looked up through the unique index in one
 * probe, while a salted hash would force a scan over candidate rows.
 */
export const hashRefreshToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");
