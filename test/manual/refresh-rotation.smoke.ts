import { eq } from "drizzle-orm";

import { NestFactory } from "@nestjs/core";

import { AppException } from "@/common/exceptions/app.exception";
import { generateId } from "@/common/utils/id";
import { ErrorCodes } from "@/contracts";
import { CoreModule } from "@/core/core.module";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import { authSessions, users } from "@/drizzle/schema";
import { AuthService } from "@/modules/auth/application/auth.service";

/**
 * Manual check of refresh rotation against a real database.
 *
 * The unit tests stub the store, so the transaction, the unique index and the
 * conditional update are only ever exercised here.
 *
 *   docker compose up -d postgres && bun run db:migrate
 *   bun run smoke:auth-refresh
 *
 * Creates a throwaway account with synthetic data and deletes it afterwards;
 * the sessions it opened disappear with it through the cascade.
 */
const METADATA = { userAgent: "smoke-runner/1.0", ipAddress: "127.0.0.1" };
const PASSWORD = "Sm0keRunnerPassword";

const step = (message: string): void => {
  console.log(`• ${message}`);
};

const expectRejected = async (
  description: string,
  action: () => Promise<unknown>,
): Promise<void> => {
  try {
    await action();
  } catch (error) {
    if (
      error instanceof AppException &&
      error.code === ErrorCodes.AUTH_REFRESH_TOKEN_INVALID
    ) {
      step(`${description}: rejected as expected`);

      return;
    }

    throw error;
  }

  throw new Error(`${description}: expected a rejection, got a fresh session`);
};

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(CoreModule, {
    logger: ["error", "warn"],
  });

  const auth = app.get(AuthService);
  const db = app.get<DrizzleService["db"]>(DRIZZLE);
  const email = `smoke-${generateId()}@example.test`;

  try {
    await auth.createUser({
      email,
      password: PASSWORD,
      fullName: "Смоук Тестовый",
      role: "operator",
    });
    step(`created ${email}`);

    const first = await auth.login({ email, password: PASSWORD }, METADATA);
    step(`logged in, refresh token valid for ${first.refreshExpiresIn}s`);

    const second = await auth.refresh(first.refreshToken);
    if (second.refreshToken === first.refreshToken) {
      throw new Error("rotation returned the same token");
    }
    step("rotated the refresh token");

    await expectRejected("replay of the spent token", () =>
      auth.refresh(first.refreshToken),
    );

    await expectRejected("successor of a revoked chain", () =>
      auth.refresh(second.refreshToken),
    );

    const [revoked] = await db
      .select({
        id: authSessions.id,
        revokedReason: authSessions.revokedReason,
      })
      .from(authSessions)
      .where(eq(authSessions.revokedReason, "token_reuse"))
      .limit(1);

    if (!revoked) {
      throw new Error("no session was recorded as reused");
    }
    step(`session ${revoked.id} recorded as ${revoked.revokedReason ?? "?"}`);

    const third = await auth.login({ email, password: PASSWORD }, METADATA);
    await auth.logout(third.refreshToken);
    await expectRejected("token of a session closed by logout", () =>
      auth.refresh(third.refreshToken),
    );

    console.log("\nrefresh rotation behaves as expected");
  } finally {
    await db.delete(users).where(eq(users.email, email));
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
