import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { generateId } from "@/common/utils/id";
import { db, pool } from "@/core/database/drizzle.client";
import { authSessions, users } from "@/drizzle/schema";
import { CreateUserSchema } from "@/modules/auth/dto/create-user.dto";

const SALT_ROUNDS = 12;

const readAdmin = () =>
  CreateUserSchema.parse({
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@system112.local",
    password:
      process.env.SEED_ADMIN_PASSWORD ??
      (process.env.NODE_ENV === "production"
        ? undefined
        : "System112Admin2026!"),
    fullName: process.env.SEED_ADMIN_FULL_NAME ?? "Администратор системы",
    role: "admin",
  });

async function main(): Promise<void> {
  const admin = readAdmin();

  try {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, admin.email))
      .limit(1);

    if (!existing) {
      await db.insert(users).values({
        id: generateId(),
        email: admin.email,
        passwordHash: await bcrypt.hash(admin.password, SALT_ROUNDS),
        fullName: admin.fullName,
        role: "admin",
      });

      console.log(`Created bootstrap admin ${admin.email}`);
      return;
    }

    const passwordMatches = await bcrypt.compare(
      admin.password,
      existing.passwordHash,
    );
    const profileMatches =
      existing.fullName === admin.fullName && existing.role === "admin";

    if (passwordMatches && profileMatches) {
      console.log(`Bootstrap admin ${admin.email} is already up to date`);
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          fullName: admin.fullName,
          role: "admin",
          updatedAt: new Date(),
          ...(passwordMatches
            ? {}
            : { passwordHash: await bcrypt.hash(admin.password, SALT_ROUNDS) }),
        })
        .where(eq(users.id, existing.id));

      if (!passwordMatches) {
        await tx
          .delete(authSessions)
          .where(eq(authSessions.userId, existing.id));
      }
    });

    console.log(`Updated bootstrap admin ${admin.email}`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
