import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";

import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  authRefreshTokens,
  authSessions,
  type AuthSessionRevokedReason,
} from "@/drizzle/schema";

import type {
  AuthSessionStore,
  NewRefreshTokenInput,
  NewSessionInput,
  RefreshTokenWithSession,
} from "./ports/auth-session-store.port";

@Injectable()
export class DrizzleAuthSessionStore implements AuthSessionStore {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService["db"]) {}

  async createSession(
    session: NewSessionInput,
    token: NewRefreshTokenInput,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(authSessions).values(session);
      await tx.insert(authRefreshTokens).values(token);
    });
  }

  async findRefreshToken(
    tokenHash: string,
  ): Promise<RefreshTokenWithSession | null> {
    const [row] = await this.db
      .select({
        token: {
          id: authRefreshTokens.id,
          sessionId: authRefreshTokens.sessionId,
          expiresAt: authRefreshTokens.expiresAt,
          usedAt: authRefreshTokens.usedAt,
        },
        session: {
          id: authSessions.id,
          userId: authSessions.userId,
          expiresAt: authSessions.expiresAt,
          revokedAt: authSessions.revokedAt,
        },
      })
      .from(authRefreshTokens)
      .innerJoin(authSessions, eq(authRefreshTokens.sessionId, authSessions.id))
      .where(eq(authRefreshTokens.tokenHash, tokenHash))
      .limit(1);

    return row ?? null;
  }

  async replaceRefreshToken(
    tokenId: string,
    successor: NewRefreshTokenInput,
    usedAt: Date,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      // The row lock decides the race: of two concurrent refreshes carrying the
      // same token, exactly one finds used_at still null.
      const claimed = await tx
        .update(authRefreshTokens)
        .set({ usedAt })
        .where(
          and(
            eq(authRefreshTokens.id, tokenId),
            isNull(authRefreshTokens.usedAt),
          ),
        )
        .returning({ id: authRefreshTokens.id });

      if (claimed.length === 0) {
        return false;
      }

      // Inside the same transaction, so a crash here cannot leave the client
      // with a spent token and no successor.
      await tx.insert(authRefreshTokens).values(successor);

      return true;
    });
  }

  async revokeSession(
    sessionId: string,
    reason: AuthSessionRevokedReason,
    revokedAt: Date,
  ): Promise<void> {
    // Guarded so a later logout cannot overwrite a recorded token reuse.
    await this.db
      .update(authSessions)
      .set({ revokedAt, revokedReason: reason })
      .where(
        and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt)),
      );
  }
}
