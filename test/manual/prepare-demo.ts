import { NestFactory } from "@nestjs/core";
import bcrypt from "bcryptjs";
import { and, desc, eq, inArray } from "drizzle-orm";

import { generateId } from "@/common/utils/id";
import { CoreModule } from "@/core/core.module";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  ddsExercises,
  ddsLessonInsights,
  ddsLessons,
  trainingGroupMembers,
  trainingGroups,
  users,
} from "@/drizzle/schema";
import { DdsExerciseService } from "@/modules/dds-exercise/application/dds-exercise.service";
import { DdsLessonService } from "@/modules/dds-exercise/application/dds-lesson.service";
import { DdsReferenceService } from "@/modules/dds-exercise/application/dds-reference.service";
import { DdsReportService } from "@/modules/dds-exercise/application/dds-report.service";
import type { DdsExercise } from "@/modules/dds-exercise/dto/dds-exercise.dto";

const DEMO_CODE = "DDS-DEMO";
const PASSWORD = "Demo112!";
const USERS = [
  {
    email: "dds-demo-01@example.test",
    fullName: "Диспетчер ДДС-01",
    serviceTag: "01",
  },
  {
    email: "dds-demo-02@example.test",
    fullName: "Диспетчер ДДС-02",
    serviceTag: "02",
  },
  {
    email: "dds-demo-03@example.test",
    fullName: "Диспетчер ДДС-03",
    serviceTag: "03",
  },
] as const;

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(CoreModule, {
    logger: ["error", "warn"],
  });
  const db = app.get<DrizzleService["db"]>(DRIZZLE);
  const lessons = app.get(DdsLessonService);
  const exercises = app.get(DdsExerciseService);
  const references = app.get(DdsReferenceService);
  const reports = app.get(DdsReportService);

  try {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const accounts = [
      {
        email: "dds-demo-instructor@example.test",
        fullName: "Преподаватель ДДС",
        role: "instructor" as const,
      },
      ...USERS.map(({ email, fullName }) => ({
        email,
        fullName,
        role: "operator" as const,
      })),
    ];
    for (const account of accounts) {
      await db
        .insert(users)
        .values({ id: generateId(), passwordHash, ...account })
        .onConflictDoUpdate({
          target: users.email,
          set: {
            fullName: account.fullName,
            role: account.role,
            passwordHash,
            isActive: true,
            updatedAt: new Date(),
          },
        });
    }
    const storedUsers = await db
      .select()
      .from(users)
      .where(
        inArray(
          users.email,
          accounts.map(({ email }) => email),
        ),
      );
    const instructor = storedUsers.find(
      ({ email }) => email === accounts[0]!.email,
    )!;
    const students = USERS.map((definition) => ({
      ...definition,
      user: storedUsers.find(({ email }) => email === definition.email)!,
    }));

    await db
      .insert(trainingGroups)
      .values({
        id: generateId(),
        name: "Демонстрационная смена ДДС",
        code: DEMO_CODE,
        organization: "Учебный центр",
        instructorId: instructor.id,
      })
      .onConflictDoUpdate({
        target: trainingGroups.code,
        set: {
          name: "Демонстрационная смена ДДС",
          instructorId: instructor.id,
          status: "active",
          updatedAt: new Date(),
        },
      });
    const [group] = await db
      .select()
      .from(trainingGroups)
      .where(eq(trainingGroups.code, DEMO_CODE))
      .limit(1);
    if (!group) throw new Error("Не удалось создать демонстрационную группу");
    for (const student of students) {
      await db
        .insert(trainingGroupMembers)
        .values({
          id: generateId(),
          groupId: group.id,
          userId: student.user.id,
          serviceTag: student.serviceTag,
        })
        .onConflictDoUpdate({
          target: [trainingGroupMembers.groupId, trainingGroupMembers.userId],
          set: { serviceTag: student.serviceTag },
        });
    }

    const [foundExisting] = await db
      .select()
      .from(ddsLessons)
      .where(
        and(
          eq(ddsLessons.groupId, group.id),
          eq(ddsLessons.title, "Демонстрация ДДС"),
        ),
      )
      .orderBy(desc(ddsLessons.startedAt))
      .limit(1);
    let existing: typeof ddsLessons.$inferSelect | undefined = foundExisting;
    if (existing?.status === "finished") {
      const report = await reports.lessonReport(
        { id: instructor.id, role: "instructor" },
        existing.id,
      );
      printResult(
        existing.id,
        report.cards.map(({ finalScore }) => finalScore),
        report.insights?.status ?? "pending",
      );
      return;
    }
    if (existing) {
      // Повторный запуск восстанавливает только незавершённый демо-набор и не касается чужих занятий.
      await db
        .delete(ddsExercises)
        .where(eq(ddsExercises.lessonId, existing.id));
      await db.delete(ddsLessons).where(eq(ddsLessons.id, existing.id));
      existing = undefined;
    }

    const referencePage = await references.list({ page: 1, pageSize: 100 });
    const candidates = referencePage.items.filter(
      ({ category, status }) =>
        ["fire", "criminal", "medical"].includes(category) &&
        status === "draft",
    );
    const approval = await references.approveMany(
      { id: instructor.id, role: "instructor" },
      candidates.map(({ scenarioVersionId }) => scenarioVersionId),
    );
    if (approval.rejected.length) {
      throw new Error(
        `Не готовы эталоны: ${approval.rejected.map(({ reason }) => reason).join("; ")}`,
      );
    }

    const lesson =
      existing ??
      (await lessons.create(
        { id: instructor.id, role: "instructor" },
        {
          eventId: generateId(),
          groupId: group.id,
          title: "Демонстрация ДДС",
          categories: ["fire", "criminal", "medical"],
          cardSource: "generated",
          acknowledgementNormSeconds: 30,
          passThreshold: 75,
        },
      ));
    const issued: Array<{
      student: (typeof students)[number];
      exercise: DdsExercise;
    }> = [];
    for (const student of students) {
      const next = await lessons.next(student.user.id, lesson.id, generateId());
      if (next.status !== "ready" || !next.exercise)
        throw new Error(next.reason ?? `Нет карточки для ${student.fullName}`);
      issued.push({ student, exercise: next.exercise });
    }

    for (let index = 0; index < issued.length; index += 1) {
      const item = issued[index]!;
      if (index === 1) {
        await db
          .update(ddsExercises)
          .set({ acknowledgementDeadlineAt: new Date(Date.now() - 1_000) })
          .where(eq(ddsExercises.id, item.exercise.id));
      }
      await exercises.transition(item.exercise.id, item.student.user.id, {
        eventId: generateId(),
        status: "accepted",
        comment: "Карточка принята, бригада направлена",
      });
      if (index === 2) {
        await exercises.transition(item.exercise.id, item.student.user.id, {
          eventId: generateId(),
          status: "refused",
          comment: "Карточка не относится к зоне ответственности службы",
        });
        continue;
      }
      for (const status of [
        "responding",
        "arrived",
        "working",
        "completed",
      ] as const) {
        await exercises.transition(item.exercise.id, item.student.user.id, {
          eventId: generateId(),
          status,
          comment:
            status === "completed"
              ? "Работы завершены, результат передан в смену"
              : undefined,
        });
      }
    }

    const evaluationDeadline = Date.now() + 180_000;
    let evaluationsReady = false;
    while (Date.now() < evaluationDeadline) {
      const details = await Promise.all(
        issued.map(({ exercise, student }) =>
          exercises.get(exercise.id, student.user.id).catch(() => null),
        ),
      );
      evaluationsReady = details
        .filter(Boolean)
        .every(
          (card) =>
            card?.textEvaluation?.status === "done" ||
            card?.textEvaluation?.status === "skipped",
        );
      if (evaluationsReady) break;
      await wait(1_000);
    }
    if (!evaluationsReady)
      throw new Error(
        "Текстовая оценка демо-карточек не завершилась за 180 секунд",
      );
    await lessons.finish(
      { id: instructor.id, role: "instructor" },
      lesson.id,
      generateId(),
    );
    const insightsDeadline = Date.now() + 180_000;
    let insightsStatus = "pending";
    while (Date.now() < insightsDeadline) {
      const [job] = await db
        .select({ status: ddsLessonInsights.status })
        .from(ddsLessonInsights)
        .where(eq(ddsLessonInsights.lessonId, lesson.id))
        .limit(1);
      insightsStatus = job?.status ?? "pending";
      if (["done", "failed"].includes(insightsStatus)) break;
      await wait(1_000);
    }
    const report = await reports.lessonReport(
      { id: instructor.id, role: "instructor" },
      lesson.id,
    );
    printResult(
      lesson.id,
      report.cards.map(({ finalScore }) => finalScore),
      insightsStatus,
    );
  } finally {
    await app.close();
  }
}

function printResult(
  lessonId: string,
  scores: readonly (number | null)[],
  insightsStatus: string,
): void {
  const baseUrl = process.env.DEMO_APP_URL ?? "http://localhost:5173";
  console.log(`Отчёт: ${baseUrl}/dds-lessons/${lessonId}/report`);
  console.log(
    `Баллы: ${scores.map((score) => score ?? "ожидается").join(", ")}`,
  );
  console.log(`Выводы ИИ: ${insightsStatus}`);
  console.log(
    "Демо-данные имеют код группы DDS-DEMO; при необходимости удалите эту группу вручную.",
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
