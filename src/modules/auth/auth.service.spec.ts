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

const createService = (
  db: DrizzleService["db"],
  signAsync: jest.Mock = jest.fn().mockResolvedValue("signed-token"),
): { service: AuthService; signAsync: jest.Mock } => {
  const tokenSigner: TokenSigner = { signAsync };

  return { service: new AuthService(db, tokenSigner), signAsync };
};

describe(AuthService.name, () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("issues a token with the account claims", async () => {
    const user = await createUserRecord();
    const { service, signAsync } = createService(createDb([user]));

    const session = await service.login({
      email: user.email,
      password: PASSWORD,
    });

    expect(signAsync).toHaveBeenCalledWith({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    expect(session).toEqual({
      accessToken: "signed-token",
      tokenType: "Bearer",
      expiresIn: 3_600,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
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
      service.login({ email: "unknown@example.test", password: PASSWORD }),
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
      service.login({ email: user.email, password: "WrongPassword1" }),
    ).rejects.toMatchObject({
      code: ErrorCodes.AUTH_LOGIN_INVALID_CREDENTIALS,
    });

    expect(signAsync).not.toHaveBeenCalled();
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
});
