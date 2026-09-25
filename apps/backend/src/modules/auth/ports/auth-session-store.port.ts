import type { AuthSessionRevokedReason } from "@/drizzle/schema";

export interface NewSessionInput {
  id: string;
  userId: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: Date;
}

export interface NewRefreshTokenInput {
  id: string;
  sessionId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface RefreshTokenWithSession {
  token: {
    id: string;
    sessionId: string;
    expiresAt: Date;
    usedAt: Date | null;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    revokedAt: Date | null;
  };
}

/**
 * Persistence for refresh sessions.
 *
 * Split out as a port for testability rather than for swappability: rotation is
 * a transaction around a conditional update, and the part worth testing is the
 * order of the rules, not the SQL. Stubbing a query builder deeply enough to
 * express "this row was already claimed" would produce a spec that tests the
 * stub. The store never sees a raw token — only its digest.
 */
export interface AuthSessionStore {
  /** Writes the session and its first refresh token together. */
  createSession(
    session: NewSessionInput,
    token: NewRefreshTokenInput,
  ): Promise<void>;

  findRefreshToken(tokenHash: string): Promise<RefreshTokenWithSession | null>;

  /**
   * Stamps the token as used and appends its successor atomically.
   *
   * Resolves `false` when the row was already claimed — two concurrent
   * refreshes with the same token, which is indistinguishable from a replay.
   */
  replaceRefreshToken(
    tokenId: string,
    successor: NewRefreshTokenInput,
    usedAt: Date,
  ): Promise<boolean>;

  /** Revoking is idempotent, and the first reason recorded wins. */
  revokeSession(
    sessionId: string,
    reason: AuthSessionRevokedReason,
    revokedAt: Date,
  ): Promise<void>;

  /** Ends every still active session of a user. */
  revokeUserSessions(
    userId: string,
    reason: AuthSessionRevokedReason,
    revokedAt: Date,
  ): Promise<void>;
}
