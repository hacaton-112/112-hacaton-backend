import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { generateId } from "@/common/utils/id";
import { db, pool } from "@/core/database/drizzle.client";
import { authSessions, users } from "@/drizzle/schema";
import { CreateUserSchema } from "@/modules/auth/dto/create-user.dto";

const SALT_ROUNDS = 12;

const readUsersToSeed = () => [
  CreateUserSchema.parse({
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@system112.local",
    password:
      process.env.SEED_ADMIN_PASSWORD ??
      (process.env.NODE_ENV === "production"
        ? undefined
        : "System112Admin2026!"),
    fullName: process.env.SEED_ADMIN_FULL_NAME ?? "Администратор системы",
    role: "admin",
  }),
  CreateUserSchema.parse({
    email: process.env.SEED_INSTRUCTOR_EMAIL ?? "instructor@system112.local",
    password:
      process.env.SEED_INSTRUCTOR_PASSWORD ??
      (process.env.NODE_ENV === "production"
        ? undefined
        : "System112Instructor2026!"),
    fullName:
      process.env.SEED_INSTRUCTOR_FULL_NAME ??
      "Преподаватель учебного центра",
    role: "instructor",
  }),
  CreateUserSchema.parse({
    email: process.env.SEED_OPERATOR_EMAIL ?? "operator@system112.local",
    password:
      process.env.SEED_OPERATOR_PASSWORD ??
      (process.env.NODE_ENV === "production"
        ? undefined
        : "System112Operator2026!"),
    fullName: process.env.SEED_OPERATOR_FULL_NAME ?? "Оператор-стажер",
    role: "operator",
  }),
];

async function main(): Promise<void> {
  const usersToSeed = readUsersToSeed();

  try {
    for (const user of usersToSeed) {
      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.email, user.email))
        .limit(1);

      if (!existing) {
        await db.insert(users).values({
          id: generateId(),
          email: user.email,
          passwordHash: await bcrypt.hash(user.password, SALT_ROUNDS),
          fullName: user.fullName,
          role: user.role,
        });

        console.log(`Created bootstrap ${user.role} ${user.email}`);
        continue;
      }

      const passwordMatches = await bcrypt.compare(
        user.password,
        existing.passwordHash,
      );
      const profileMatches =
        existing.fullName === user.fullName && existing.role === user.role;

      if (passwordMatches && profileMatches) {
        console.log(`Bootstrap ${user.role} ${user.email} is already up to date`);
        continue;
      }

      await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({
            fullName: user.fullName,
            role: user.role,
            updatedAt: new Date(),
            ...(passwordMatches
              ? {}
              : { passwordHash: await bcrypt.hash(user.password, SALT_ROUNDS) }),
          })
          .where(eq(users.id, existing.id));

        if (!passwordMatches) {
          await tx
            .delete(authSessions)
            .where(eq(authSessions.userId, existing.id));
        }
      });

      console.log(`Updated bootstrap ${user.role} ${user.email}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
