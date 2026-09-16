// The service reads the token lifetime from the validated environment; the
// tests must not depend on a developer's .env being filled in.
jest.mock("@/core/config/env.config", () => ({
  env: { JWT_ACCESS_TTL_SECONDS: 3_600 },
}));

import bcrypt from "bcryptjs";

import {
  AppConflictException,
  AppUnauthorizedException,
} from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";
import type { DrizzleService } from "@/core/database/drizzle.service";
import type { UserRecord } from "@/drizzle/schema";

import type { AuthSessionService } from "./auth-session.service";
import { AuthService } from "./auth.service";
import type { TokenSigner } from "./ports/token-signer.port";

const PASSWORD = "Str0ngPassword";
const TEST_SALT_ROUNDS = 4;

const createUserRecord = async (): Promise<UserRecord> => ({
  id: "0f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f0f",
  email: "operator@example.test",
  passwordHash: await bcrypt.hash(PASSWORD, TEST_SALT_ROUNDS),
  fullName: "Иванов Иван",
  role: "operator",
  isActive: true,
  createdAt: new Date("2026-09-01T10:00:00.000Z"),
  updatedAt: new Date("2026-09-01T10:00:00.000Z"),
});

const createDb = (
  rows: UserRecord[],
  inserted: UserRecord[] = [],
): DrizzleService["db"] =>
  ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(rows),
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: () => Promise.resolve(inserted),
      }),
    }),
  }) as unknown as DrizzleService["db"];

const METADATA = { userAgent: "trainer-client/0.1.0", ipAddress: "10.0.0.5" };

interface SessionMocks {
  issue: jest.Mock;
  rotate: jest.Mock;
  revokeByToken: jest.Mock;
  revokeAllForUser: jest.Mock;
}

const createService = (
  db: DrizzleService["db"],
  signAsync: jest.Mock = jest.fn().mockResolvedValue("signed-token"),
  sessionOverrides: Partial<SessionMocks> = {},
): {
  service: AuthService;
  signAsync: jest.Mock;
  sessions: SessionMocks;
} => {
  const tokenSigner: TokenSigner = { signAsync };
  const sessions: SessionMocks = {
    issue: jest.fn().mockResolvedValue({
      sessionId: "session-1",
      userId: "0f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f0f",
      refreshToken: "refresh-token",
      refreshExpiresIn: 2_592_000,
    }),
    rotate: jest.fn(),
    revokeByToken: jest.fn().mockResolvedValue(undefined),
    revokeAllForUser: jest.fn().mockResolvedValue(undefined),
    ...sessionOverrides,
  };

  return {
    service: new AuthService(
      db,
      tokenSigner,
      sessions as unknown as AuthSessionService,
    ),
    signAsync,
    sessions,
  };
};

describe(AuthService.name, () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("issues a token with the account claims", async () => {
    const user = await createUserRecord();
    const { service, signAsync } = createService(createDb([user]));

    const session = await service.login(
      { email: user.email, password: PASSWORD },
      METADATA,
    );

    expect(signAsync).toHaveBeenCalledWith({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    expect(session).toEqual({
      accessToken: "signed-token",
      tokenType: "Bearer",
      expiresIn: 3_600,
      refreshToken: "refresh-token",
      refreshExpiresIn: 2_592_000,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isActive: true,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
    });
  });

  it("compares a password even when the account does not exist", async () => {
    // The comparison against a throwaway digest is what makes a missing
    // account and a wrong password cost the same; skipping it would let a
    // caller enumerate registered addresses by response time.
    const compare = jest.spyOn(bcrypt, "compare");
    const { service, signAsync } = createService(createDb([]));

    await expect(
      service.login(
        { email: "unknown@example.test", password: PASSWORD },
        METADATA,
      ),
    ).rejects.toMatchObject({
      code: ErrorCodes.AUTH_LOGIN_INVALID_CREDENTIALS,
    });

    expect(compare).toHaveBeenCalledTimes(1);
    expect(signAsync).not.toHaveBeenCalled();
  });

  it("rejects a wrong password with the same error as an unknown account", async () => {
    const user = await createUserRecord();
    const { service, signAsync } = createService(createDb([user]));

    await expect(
      service.login(
        { email: user.email, password: "WrongPassword1" },
        METADATA,
      ),
    ).rejects.toMatchObject({
      code: ErrorCodes.AUTH_LOGIN_INVALID_CREDENTIALS,
    });

    expect(signAsync).not.toHaveBeenCalled();
  });

  it("rejects an inactive account with the same public login error", async () => {
    const user = { ...(await createUserRecord()), isActive: false };
    const { service, sessions } = createService(createDb([user]));

    await expect(
      service.login({ email: user.email, password: PASSWORD }, METADATA),
    ).rejects.toMatchObject({
      code: ErrorCodes.AUTH_LOGIN_INVALID_CREDENTIALS,
    });

    expect(sessions.issue).not.toHaveBeenCalled();
  });

  it("opens a session with the client metadata", async () => {
    const user = await createUserRecord();
    const { service, sessions } = createService(createDb([user]));

    await service.login({ email: user.email, password: PASSWORD }, METADATA);

    expect(sessions.issue).toHaveBeenCalledWith(user.id, METADATA);
  });

  it("opens no session when the credentials are wrong", async () => {
    // A session row, or any extra write on the failure path, would reintroduce
    // the timing difference the dummy-hash comparison exists to remove.
    const user = await createUserRecord();
    const { service, sessions } = createService(createDb([user]));

    await expect(
      service.login(
        { email: user.email, password: "WrongPassword1" },
        METADATA,
      ),
    ).rejects.toBeInstanceOf(AppUnauthorizedException);

    expect(sessions.issue).not.toHaveBeenCalled();
  });

  it("returns a fresh pair when a refresh token is rotated", async () => {
    const user = await createUserRecord();
    const { service, sessions } = createService(
      createDb([user]),
      jest.fn().mockResolvedValue("new-access-token"),
      {
        rotate: jest.fn().mockResolvedValue({
          sessionId: "session-1",
          userId: user.id,
          refreshToken: "next-refresh-token",
          refreshExpiresIn: 2_592_000,
        }),
      },
    );

    const session = await service.refresh("refresh-token");

    expect(sessions.rotate).toHaveBeenCalledWith("refresh-token");
    expect(session).toMatchObject({
      accessToken: "new-access-token",
      refreshToken: "next-refresh-token",
      user: { id: user.id },
    });
  });

  it("hides a deleted account behind the refresh error", async () => {
    const { service } = createService(createDb([]), undefined, {
      rotate: jest.fn().mockResolvedValue({
        sessionId: "session-1",
        userId: "0f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f0f",
        refreshToken: "next-refresh-token",
        refreshExpiresIn: 2_592_000,
      }),
    });

    await expect(service.refresh("refresh-token")).rejects.toMatchObject({
      code: ErrorCodes.AUTH_REFRESH_TOKEN_INVALID,
    });
  });

  it("revokes refresh sessions of an inactive account", async () => {
    const user = { ...(await createUserRecord()), isActive: false };
    const { service, sessions } = createService(createDb([user]), undefined, {
      rotate: jest.fn().mockResolvedValue({
        sessionId: "session-1",
        userId: user.id,
        refreshToken: "next-refresh-token",
        refreshExpiresIn: 2_592_000,
      }),
    });

    await expect(service.refresh("refresh-token")).rejects.toMatchObject({
      code: ErrorCodes.AUTH_REFRESH_TOKEN_INVALID,
    });
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith(user.id);
  });

  it("revokes the session on logout, including for an unknown token", async () => {
    const { service, sessions } = createService(createDb([]));

    await expect(service.logout("refresh-token")).resolves.toBeUndefined();

    expect(sessions.revokeByToken).toHaveBeenCalledWith("refresh-token");
  });

  it("rejects a profile lookup for a deleted account", async () => {
    const { service } = createService(createDb([]));

    await expect(service.getProfile("missing-user")).rejects.toBeInstanceOf(
      AppUnauthorizedException,
    );
  });

  it("refuses to provision a duplicate email", async () => {
    const user = await createUserRecord();
    const { service } = createService(createDb([user]));

    await expect(
      service.createUser({
        email: user.email,
        password: PASSWORD,
        fullName: user.fullName,
        role: "operator",
      }),
    ).rejects.toBeInstanceOf(AppConflictException);
  });

  it("keeps the last active administrator in place", async () => {
    const db = {
      select: jest
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([{ role: "admin", isActive: true }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: () => Promise.resolve([{ activeAdmins: 1 }]),
          }),
        }),
    } as unknown as DrizzleService["db"];
    const { service } = createService(db);

    await expect(
      service.updateUser("0f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f0f", {
        role: "instructor",
      }),
    ).rejects.toMatchObject({ code: ErrorCodes.AUTH_LAST_ADMIN_REQUIRED });
  });
});
