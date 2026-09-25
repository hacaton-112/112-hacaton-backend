import { Inject, Injectable, Logger } from "@nestjs/common";

import { AppUnauthorizedException } from "@/common/exceptions/app.exception";
import { generateId } from "@/common/utils/id";
import { ErrorCodes } from "@/contracts";
import { AuditLogService } from "@/modules/audit-log/application/audit-log.service";

import { AUTH_SESSION_CONFIG, AUTH_SESSION_STORE } from "../auth.tokens";
import type { AuthSessionStore } from "../ports/auth-session-store.port";
import { createRefreshToken, hashRefreshToken } from "../domain/refresh-token";

export interface AuthSessionConfig {
  /** Idle window of a single refresh token. */
  refreshTokenTtlSeconds: number;
  /** Absolute cap on a rotation chain; a refresh never extends it. */
  sessionTtlSeconds: number;
}

export interface ClientMetadata {
  userAgent: string | null;
  ipAddress: string | null;
}

export interface IssuedRefreshToken {
  sessionId: string;
  userId: string;
  refreshToken: string;
  refreshExpiresIn: number;
}

export interface RevokedAuthSession {
  sessionId: string;
  userId: string;
}

const MILLISECONDS_PER_SECOND = 1_000;

const addSeconds = (moment: Date, seconds: number): Date =>
  new Date(moment.getTime() + seconds * MILLISECONDS_PER_SECOND);

/**
 * At least one second: the response schema requires a positive integer, and a
 * session in its final moments would otherwise fail serialization instead of
 * handing back the token it just issued.
 */
const secondsUntil = (expiresAt: Date, now: Date): number =>
  Math.max(
    1,
    Math.floor((expiresAt.getTime() - now.getTime()) / MILLISECONDS_PER_SECOND),
  );

/**
 * Issues, rotates and revokes refresh sessions.
 *
 * `now` is a trailing parameter rather than a clock port: the expiry rules are
 * the interesting part and tests need to move time, but nothing here justifies
 * another injected collaborator.
 */
@Injectable()
export class AuthSessionService {
  private readonly logger = new Logger(AuthSessionService.name);

  constructor(
    @Inject(AUTH_SESSION_STORE) private readonly store: AuthSessionStore,
    @Inject(AUTH_SESSION_CONFIG) private readonly config: AuthSessionConfig,
    private readonly audit: AuditLogService,
  ) {}

  async issue(
    userId: string,
    metadata: ClientMetadata,
    now: Date = new Date(),
  ): Promise<IssuedRefreshToken> {
    const sessionId = generateId();
    const sessionExpiresAt = addSeconds(now, this.config.sessionTtlSeconds);
    const refreshToken = createRefreshToken();
    const expiresAt = this.tokenExpiry(now, sessionExpiresAt);

    await this.store.createSession(
      {
        id: sessionId,
        userId,
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
        expiresAt: sessionExpiresAt,
      },
      {
        id: generateId(),
        sessionId,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt,
      },
    );

    return {
      sessionId,
      userId,
      refreshToken,
      refreshExpiresIn: secondsUntil(expiresAt, now),
    };
  }

  /**
   * Exchanges a refresh token for its successor.
   *
   * The order of the checks is deliberate: a replayed token is the only signal
   * of theft available, so it is examined before the session's own state and
   * before either expiry, which would otherwise swallow it.
   */
  async rotate(
    rawToken: string,
    now: Date = new Date(),
    ipAddress: string | null = null,
  ): Promise<IssuedRefreshToken> {
    const found = await this.store.findRefreshToken(hashRefreshToken(rawToken));

    if (found === null) {
      this.logger.warn("Rejected an unknown refresh token");
      throw this.reject();
    }

    const { session, token } = found;

    if (token.usedAt !== null) {
      await this.store.revokeSession(session.id, "token_reuse", now);
      await this.audit.log({
        actorId: session.userId,
        action: "auth.refresh.revoked",
        resource: "auth-session",
        resourceId: session.id,
        sessionId: session.id,
        details: { reason: "token_reuse" },
        ipAddress,
      });
      this.logger.warn(
        `Revoked session ${session.id}: a refresh token was presented twice`,
      );
      throw this.reject();
    }

    if (session.revokedAt !== null) {
      this.logger.warn(`Rejected a token of revoked session ${session.id}`);
      throw this.reject();
    }

    if (token.expiresAt.getTime() <= now.getTime()) {
      this.logger.warn(`Rejected an expired token of session ${session.id}`);
      throw this.reject();
    }

    if (session.expiresAt.getTime() <= now.getTime()) {
      this.logger.warn(`Rejected a token of expired session ${session.id}`);
      throw this.reject();
    }

    const successor = createRefreshToken();
    const expiresAt = this.tokenExpiry(now, session.expiresAt);
    const claimed = await this.store.replaceRefreshToken(
      token.id,
      {
        id: generateId(),
        sessionId: session.id,
        tokenHash: hashRefreshToken(successor),
        expiresAt,
      },
      now,
    );

    if (!claimed) {
      // The row was taken between the lookup and the update: either a genuine
      // replay or the loser of two concurrent refreshes. Indistinguishable from
      // here, so it is treated as theft.
      await this.store.revokeSession(session.id, "token_reuse", now);
      await this.audit.log({
        actorId: session.userId,
        action: "auth.refresh.revoked",
        resource: "auth-session",
        resourceId: session.id,
        sessionId: session.id,
        details: { reason: "concurrent_rotation" },
        ipAddress,
      });
      this.logger.warn(
        `Revoked session ${session.id}: a refresh token was claimed twice`,
      );
      throw this.reject();
    }

    return {
      sessionId: session.id,
      userId: session.userId,
      refreshToken: successor,
      refreshExpiresIn: secondsUntil(expiresAt, now),
    };
  }

  /**
   * Ends the session a token belongs to. Silent about unknown tokens so logout
   * cannot be used to probe which ones exist.
   */
  async revokeByToken(
    rawToken: string,
    now: Date = new Date(),
  ): Promise<RevokedAuthSession | null> {
    const found = await this.store.findRefreshToken(hashRefreshToken(rawToken));

    if (found === null) {
      return null;
    }

    await this.store.revokeSession(found.session.id, "logout", now);
    return {
      sessionId: found.session.id,
      userId: found.session.userId,
    };
  }

  /** Signs a user out everywhere, e.g. after an administrator reset the password. */
  async revokeAllForUser(
    userId: string,
    now: Date = new Date(),
  ): Promise<void> {
    await this.store.revokeUserSessions(userId, "credentials_changed", now);
  }

  /** Never outlives the session it belongs to, however the TTLs are set. */
  private tokenExpiry(now: Date, sessionExpiresAt: Date): Date {
    const idleExpiresAt = addSeconds(now, this.config.refreshTokenTtlSeconds);

    return idleExpiresAt.getTime() < sessionExpiresAt.getTime()
      ? idleExpiresAt
      : sessionExpiresAt;
  }

  /** One error for every failure: the reason is logged, never returned. */
  private reject(): AppUnauthorizedException {
    return new AppUnauthorizedException(
      ErrorCodes.AUTH_REFRESH_TOKEN_INVALID,
      "Refresh token is invalid or expired",
    );
  }
}
