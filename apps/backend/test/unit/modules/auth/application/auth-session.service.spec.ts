import { Logger } from "@nestjs/common";

import { AppUnauthorizedException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";

import {
  type AuthSessionConfig,
  AuthSessionService,
} from "@/modules/auth/application/auth-session.service";
import type {
  AuthSessionStore,
  RefreshTokenWithSession,
} from "@/modules/auth/ports/auth-session-store.port";
import { hashRefreshToken } from "@/modules/auth/domain/refresh-token";
import type { AuditLogService } from "@/modules/audit-log/application/audit-log.service";

const NOW = new Date("2026-09-08T10:00:00.000Z");
const HOUR = 3_600;
const DAY = 24 * HOUR;

const config: AuthSessionConfig = {
  refreshTokenTtlSeconds: 30 * DAY,
  sessionTtlSeconds: 90 * DAY,
};

interface StoreMocks {
  createSession: jest.Mock;
  findRefreshToken: jest.Mock;
  replaceRefreshToken: jest.Mock;
  revokeSession: jest.Mock;
  revokeUserSessions: jest.Mock;
}

const createService = (
  overrides: Partial<StoreMocks> = {},
  sessionConfig: AuthSessionConfig = config,
): {
  service: AuthSessionService;
  store: StoreMocks;
  audit: { log: jest.Mock };
} => {
  const store: StoreMocks = {
    createSession: jest.fn().mockResolvedValue(undefined),
    findRefreshToken: jest.fn().mockResolvedValue(null),
    replaceRefreshToken: jest.fn().mockResolvedValue(true),
    revokeSession: jest.fn().mockResolvedValue(undefined),
    revokeUserSessions: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };

  return {
    service: new AuthSessionService(
      store as unknown as AuthSessionStore,
      sessionConfig,
      audit as unknown as AuditLogService,
    ),
    store,
    audit,
  };
};

const found = (
  overrides: {
    token?: Partial<RefreshTokenWithSession["token"]>;
    session?: Partial<RefreshTokenWithSession["session"]>;
  } = {},
): RefreshTokenWithSession => ({
  token: {
    id: "token-1",
    sessionId: "session-1",
    expiresAt: new Date(NOW.getTime() + 30 * DAY * 1_000),
    usedAt: null,
    ...overrides.token,
  },
  session: {
    id: "session-1",
    userId: "user-1",
    expiresAt: new Date(NOW.getTime() + 90 * DAY * 1_000),
    revokedAt: null,
    ...overrides.session,
  },
});

describe(`${AuthSessionService.name} issue`, () => {
  it("stores the digest of the token it hands back", async () => {
    const { service, store } = createService();

    const issued = await service.issue(
      "user-1",
      { userAgent: "trainer-client/0.1.0", ipAddress: "10.0.0.5" },
      NOW,
    );

    const [session, token] = store.createSession.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];

    expect(token.tokenHash).toBe(hashRefreshToken(issued.refreshToken));
    expect(token.tokenHash).not.toBe(issued.refreshToken);
    expect(session).toMatchObject({
      userId: "user-1",
      userAgent: "trainer-client/0.1.0",
      ipAddress: "10.0.0.5",
      expiresAt: new Date(NOW.getTime() + 90 * DAY * 1_000),
    });
    expect(token).toMatchObject({
      sessionId: session.id,
      expiresAt: new Date(NOW.getTime() + 30 * DAY * 1_000),
    });
    expect(issued.refreshExpiresIn).toBe(30 * DAY);
  });

  it("never issues a token that outlives its session", async () => {
    const { service, store } = createService(
      {},
      { refreshTokenTtlSeconds: 90 * DAY, sessionTtlSeconds: 7 * DAY },
    );

    const issued = await service.issue(
      "user-1",
      { userAgent: null, ipAddress: null },
      NOW,
    );

    const [session, token] = store.createSession.mock.calls[0] as [
      { expiresAt: Date },
      { expiresAt: Date },
    ];

    expect(token.expiresAt).toEqual(session.expiresAt);
    expect(issued.refreshExpiresIn).toBe(7 * DAY);
  });
});

describe(`${AuthSessionService.name} rotate`, () => {
  it("returns a different token bound to the same session", async () => {
    const previous = found();
    const { service, store } = createService({
      findRefreshToken: jest.fn().mockResolvedValue(previous),
    });

    const rotated = await service.rotate("raw-token", NOW);

    expect(rotated.refreshToken).not.toBe("raw-token");
    expect(rotated).toMatchObject({
      sessionId: "session-1",
      userId: "user-1",
    });

    const [tokenId, successor, usedAt] = store.replaceRefreshToken.mock
      .calls[0] as [string, Record<string, unknown>, Date];

    expect(tokenId).toBe("token-1");
    expect(successor.sessionId).toBe("session-1");
    expect(successor.tokenHash).toBe(hashRefreshToken(rotated.refreshToken));
    expect(usedAt).toEqual(NOW);
    expect(store.revokeSession).not.toHaveBeenCalled();
  });

  it("rejects an unknown token without touching any session", async () => {
    const { service, store } = createService();

    await expect(service.rotate("raw-token", NOW)).rejects.toBeInstanceOf(
      AppUnauthorizedException,
    );

    expect(store.revokeSession).not.toHaveBeenCalled();
    expect(store.replaceRefreshToken).not.toHaveBeenCalled();
  });

  it("revokes the whole session when a token is presented twice", async () => {
    const { service, store, audit } = createService({
      findRefreshToken: jest
        .fn()
        .mockResolvedValue(found({ token: { usedAt: new Date(NOW) } })),
    });

    await expect(service.rotate("raw-token", NOW)).rejects.toMatchObject({
      code: ErrorCodes.AUTH_REFRESH_TOKEN_INVALID,
    });

    expect(store.revokeSession).toHaveBeenCalledWith(
      "session-1",
      "token_reuse",
      NOW,
    );
    expect(store.replaceRefreshToken).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.refresh.revoked",
        resourceId: "session-1",
        details: { reason: "token_reuse" },
      }),
    );
  });

  it("revokes the session when the row was claimed by a concurrent refresh", async () => {
    const { service, store } = createService({
      findRefreshToken: jest.fn().mockResolvedValue(found()),
      replaceRefreshToken: jest.fn().mockResolvedValue(false),
    });

    await expect(service.rotate("raw-token", NOW)).rejects.toBeInstanceOf(
      AppUnauthorizedException,
    );

    expect(store.revokeSession).toHaveBeenCalledWith(
      "session-1",
      "token_reuse",
      NOW,
    );
  });

  it("checks reuse before expiry, so a stale replay is still recorded", async () => {
    const { service, store } = createService({
      findRefreshToken: jest.fn().mockResolvedValue(
        found({
          token: {
            usedAt: new Date(NOW.getTime() - DAY * 1_000),
            expiresAt: new Date(NOW.getTime() - HOUR * 1_000),
          },
        }),
      ),
    });

    await expect(service.rotate("raw-token", NOW)).rejects.toBeInstanceOf(
      AppUnauthorizedException,
    );

    expect(store.revokeSession).toHaveBeenCalledWith(
      "session-1",
      "token_reuse",
      NOW,
    );
  });

  it("rejects a token of a revoked session without revoking again", async () => {
    const { service, store } = createService({
      findRefreshToken: jest
        .fn()
        .mockResolvedValue(found({ session: { revokedAt: new Date(NOW) } })),
    });

    await expect(service.rotate("raw-token", NOW)).rejects.toBeInstanceOf(
      AppUnauthorizedException,
    );

    expect(store.revokeSession).not.toHaveBeenCalled();
    expect(store.replaceRefreshToken).not.toHaveBeenCalled();
  });

  it("rejects an expired token", async () => {
    const { service, store } = createService({
      findRefreshToken: jest.fn().mockResolvedValue(
        found({
          token: { expiresAt: new Date(NOW.getTime() - 1_000) },
        }),
      ),
    });

    await expect(service.rotate("raw-token", NOW)).rejects.toBeInstanceOf(
      AppUnauthorizedException,
    );

    expect(store.revokeSession).not.toHaveBeenCalled();
  });

  it("rejects a fresh token once the session hit its absolute cap", async () => {
    const { service, store } = createService({
      findRefreshToken: jest.fn().mockResolvedValue(
        found({
          session: { expiresAt: new Date(NOW.getTime() - 1_000) },
        }),
      ),
    });

    await expect(service.rotate("raw-token", NOW)).rejects.toBeInstanceOf(
      AppUnauthorizedException,
    );

    expect(store.replaceRefreshToken).not.toHaveBeenCalled();
  });

  it("still returns a positive lifetime in the session's last second", async () => {
    const { service } = createService({
      findRefreshToken: jest.fn().mockResolvedValue(
        found({
          session: { expiresAt: new Date(NOW.getTime() + 500) },
        }),
      ),
    });

    const rotated = await service.rotate("raw-token", NOW);

    expect(rotated.refreshExpiresIn).toBe(1);
  });

  it("reports every failure identically", async () => {
    const cases: RefreshTokenWithSession[] = [
      found({ token: { usedAt: new Date(NOW) } }),
      found({ session: { revokedAt: new Date(NOW) } }),
      found({ token: { expiresAt: new Date(NOW.getTime() - 1_000) } }),
      found({ session: { expiresAt: new Date(NOW.getTime() - 1_000) } }),
    ];

    const failures = await Promise.all(
      cases.map(async (value) => {
        const { service } = createService({
          findRefreshToken: jest.fn().mockResolvedValue(value),
        });

        return service.rotate("raw-token", NOW).catch((error: unknown) => {
          const failure = error as AppUnauthorizedException;

          return { code: failure.code, message: failure.message };
        });
      }),
    );

    const { service } = createService();
    const unknown = await service
      .rotate("raw-token", NOW)
      .catch((error: unknown) => {
        const failure = error as AppUnauthorizedException;

        return { code: failure.code, message: failure.message };
      });

    for (const failure of failures) {
      expect(failure).toEqual(unknown);
    }
  });

  it("keeps the secret and its digest out of the log", async () => {
    const warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();
    const { service } = createService({
      findRefreshToken: jest
        .fn()
        .mockResolvedValue(found({ token: { usedAt: new Date(NOW) } })),
    });

    await expect(service.rotate("raw-token", NOW)).rejects.toBeInstanceOf(
      AppUnauthorizedException,
    );

    const logged = warn.mock.calls.flat().join(" ");

    expect(logged).not.toContain("raw-token");
    expect(logged).not.toContain(hashRefreshToken("raw-token"));

    warn.mockRestore();
  });
});

describe(`${AuthSessionService.name} revokeByToken`, () => {
  it("ends the session the token belongs to", async () => {
    const { service, store } = createService({
      findRefreshToken: jest.fn().mockResolvedValue(found()),
    });

    const revoked = await service.revokeByToken("raw-token", NOW);

    expect(store.revokeSession).toHaveBeenCalledWith(
      "session-1",
      "logout",
      NOW,
    );
    expect(revoked).toEqual({ sessionId: "session-1", userId: "user-1" });
  });

  it("stays silent about an unknown token", async () => {
    const { service, store } = createService();

    await expect(
      service.revokeByToken("raw-token", NOW),
    ).resolves.toBeNull();

    expect(store.revokeSession).not.toHaveBeenCalled();
  });

  it("records logout rather than reuse for an already rotated token", async () => {
    const { service, store } = createService({
      findRefreshToken: jest
        .fn()
        .mockResolvedValue(found({ token: { usedAt: new Date(NOW) } })),
    });

    await service.revokeByToken("raw-token", NOW);

    expect(store.revokeSession).toHaveBeenCalledWith(
      "session-1",
      "logout",
      NOW,
    );
  });
});
