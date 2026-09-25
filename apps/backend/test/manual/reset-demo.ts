import { NestFactory } from "@nestjs/core";
import { eq, inArray, like } from "drizzle-orm";

import { CoreModule } from "@/core/core.module";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  ddsExercises,
  ddsLessons,
  trainingAssignments,
  trainingAttempts,
  trainingGroupMembers,
  trainingGroups,
  users,
} from "@/drizzle/schema";

const DEMO_CODE = "DDS-DEMO";
const DEMO_EMAIL = "dds-demo-%@example.test";

/**
 * Убирает данные показа.
 *
 * Узнаём их по коду группы и по почте учётных записей: ничего, кроме
 * демонстрации, под эти признаки не попадает, и чужие занятия остаются на
 * месте. Порядок удаления идёт от попыток к учётным записям — иначе внешние
 * ключи не дадут удалить пользователя.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(CoreModule, {
    logger: ["error", "warn"],
  });
  const db = app.get<DrizzleService["db"]>(DRIZZLE);

  try {
    const accounts = await db
      .select({ id: users.id })
      .from(users)
      .where(like(users.email, DEMO_EMAIL));
    const accountIds = accounts.map(({ id }) => id);
    const [group] = await db
      .select({ id: trainingGroups.id })
      .from(trainingGroups)
      .where(eq(trainingGroups.code, DEMO_CODE))
      .limit(1);

    if (group) {
      const lessons = await db
        .select({ id: ddsLessons.id })
        .from(ddsLessons)
        .where(eq(ddsLessons.groupId, group.id));
      const lessonIds = lessons.map(({ id }) => id);
      if (lessonIds.length > 0) {
        await db
          .delete(ddsExercises)
          .where(inArray(ddsExercises.lessonId, lessonIds));
        await db.delete(ddsLessons).where(inArray(ddsLessons.id, lessonIds));
      }
      console.log(`Занятий удалено: ${lessonIds.length}`);
    }

    if (accountIds.length > 0) {
      await db
        .delete(ddsExercises)
        .where(inArray(ddsExercises.operatorId, accountIds));
      await db
        .delete(trainingAttempts)
        .where(inArray(trainingAttempts.operatorId, accountIds));
      await db
        .delete(trainingAssignments)
        .where(inArray(trainingAssignments.targetUserId, accountIds));
      await db
        .delete(trainingGroupMembers)
        .where(inArray(trainingGroupMembers.userId, accountIds));
    }

    if (group) {
      await db
        .delete(trainingAssignments)
        .where(eq(trainingAssignments.groupId, group.id));
      await db
        .delete(trainingGroupMembers)
        .where(eq(trainingGroupMembers.groupId, group.id));
      await db.delete(trainingGroups).where(eq(trainingGroups.id, group.id));
      console.log("Демонстрационная группа удалена");
    }

    if (accountIds.length > 0) {
      await db.delete(users).where(inArray(users.id, accountIds));
      console.log(`Учётных записей удалено: ${accountIds.length}`);
    }

    if (!group && accountIds.length === 0)
      console.log("Демонстрационных данных не найдено");
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
