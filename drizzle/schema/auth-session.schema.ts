import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { users } from "./user.schema";

export const AUTH_SESSION_REVOKED_REASONS = [
  "logout",
  "token_reuse",
  // Администратор сменил пароль или роль: старый вход больше не действует.
  "credentials_changed",
] as const;

export type AuthSessionRevokedReason =
  (typeof AUTH_SESSION_REVOKED_REASONS)[number];

/**
 * A login, and the unit of revocation: killing a stolen chain is one update
 * here, no matter how many times its tokens were rotated.
 *
 * Named `auth_sessions` rather than `sessions` because a training session is a
 * different thing in this product — see `audit_log.session_id`.
 */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    // Unlike audit_log, which deliberately keeps no foreign key so records
    // outlive the actor, a session must not outlive its user.
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Captured at login for incident review only: never used to authorise, so
    // a roaming desktop client is not locked out by a changing address.
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    /** Absolute cap on the chain; rotation never extends it. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason").$type<AuthSessionRevokedReason>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("auth_sessions_user_id_idx").on(table.userId),
    index("auth_sessions_expires_at_idx").on(table.expiresAt),
  ],
);

/**
 * One issued refresh token, and the unit of rotation.
 *
 * Rotation appends a row and stamps `used_at` on its predecessor, so every
 * token ever issued in a chain stays recognisable. Keeping only the current
 * token per session would make a replay of an older one indistinguishable from
 * a random string, and reuse detection would quietly stop working.
 */
export const authRefreshTokens = pgTable(
  "auth_refresh_tokens",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => authSessions.id, { onDelete: "cascade" }),
    /** SHA-256 of the opaque secret; the secret itself is never stored. */
    tokenHash: text("token_hash").notNull(),
    /** Idle window of this token, capped by the session's expiry. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Set once the token has been exchanged; a second use means replay. */
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("auth_refresh_tokens_token_hash_unique_idx").on(
      table.tokenHash,
    ),
    index("auth_refresh_tokens_session_id_idx").on(table.sessionId),
    index("auth_refresh_tokens_expires_at_idx").on(table.expiresAt),
  ],
);

export type AuthSessionRecord = typeof authSessions.$inferSelect;
export type NewAuthSessionRecord = typeof authSessions.$inferInsert;
export type AuthRefreshTokenRecord = typeof authRefreshTokens.$inferSelect;
export type NewAuthRefreshTokenRecord = typeof authRefreshTokens.$inferInsert;
