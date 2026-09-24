import { NestFactory } from "@nestjs/core";
import bcrypt from "bcryptjs";
import { eq, inArray } from "drizzle-orm";

import { generateId } from "@/common/utils/id";
import { CoreModule } from "@/core/core.module";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  ddsExercises,
  ddsExerciseEvents,
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
import { DdsTrainingService } from "@/modules/dds-exercise/application/dds-training.service";
import { SCENARIO_CATALOG } from "@/modules/scenario-catalog/ports/scenario-catalog.port";
import type { ScenarioCatalog } from "@/modules/scenario-catalog/ports/scenario-catalog.port";
import { TrainingService } from "@/modules/training/training.service";
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

const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * Занятия демонстрации.
 *
 * Их три, в разные дни и с разным составом: аналитике нужна динамика и
 * повторяющиеся ошибки, а прогнозу — история попыток. У первого диспетчера
 * она набирается на все три занятия, у третьего остаётся короткой, чтобы на
 * показе было видно и честный ответ «данных мало».
 */
const LESSONS = [
  { title: "Демонстрация ДДС · занятие 1", daysAgo: 12, participants: [0, 1] },
  { title: "Демонстрация ДДС · занятие 2", daysAgo: 6, participants: [0, 1] },
  { title: "Демонстрация ДДС", daysAgo: 0, participants: [0, 1, 2] },
] as const;

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(CoreModule, {
    logger: ["error", "warn"],
  });
  const db = app.get<DrizzleService["db"]>(DRIZZLE);
  const lessons = app.get(DdsLessonService);
  const exercises = app.get(DdsExerciseService);
  const references = app.get(DdsReferenceService);
  const reports = app.get(DdsReportService);
  const training = app.get(TrainingService);
  const ddsTraining = app.get(DdsTrainingService);
  const catalog = app.get<ScenarioCatalog>(SCENARIO_CATALOG);

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

    // Прогон демонстрации всегда собирается заново: повторный запуск не должен
    // накапливать занятия, иначе аналитика на показе поедет.
    await removeDemoLessons(db, group.id);

    const referencePage = await references.list({ page: 1, pageSize: 100 });
    const candidates = referencePage.items.filter(
      ({ category, status }) =>
        ["fire", "criminal", "medical"].includes(category) &&
        status === "draft",
    );
    if (candidates.length > 0) {
      const approval = await references.approveMany(
        { id: instructor.id, role: "instructor" },
        candidates.map(({ scenarioVersionId }) => scenarioVersionId),
      );
      if (approval.rejected.length) {
        throw new Error(
          `Не готовы эталоны: ${approval.rejected.map(({ reason }) => reason).join("; ")}`,
        );
      }
    }

    const finished: { id: string; title: string; scores: (number | null)[] }[] =
      [];
    for (const [index, plan] of LESSONS.entries()) {
      const lesson = await lessons.create(
        { id: instructor.id, role: "instructor" },
        {
          eventId: generateId(),
          groupId: group.id,
          title: plan.title,
          categories: ["fire", "criminal", "medical"],
          cardSource: "generated",
          acknowledgementNormSeconds: 30,
          passThreshold: 75,
        },
      );
      const issued: Array<{
        student: (typeof students)[number];
        exercise: DdsExercise;
      }> = [];
      for (const position of plan.participants) {
        const student = students[position]!;
        const next = await lessons.next(
          student.user.id,
          lesson.id,
          generateId(),
        );
        if (next.status !== "ready" || !next.exercise)
          throw new Error(
            next.reason ?? `Нет карточки для ${student.fullName}`,
          );
        issued.push({ student, exercise: next.exercise });
      }

      for (const [seat, item] of issued.entries()) {
        // Исходы чередуются: вовремя, с просрочкой норматива и с отказом.
        // Без этого тепловая карта и частые ошибки на показе пустые.
        const outcome = (seat + index) % 3;
        if (outcome === 1) {
          await db
            .update(ddsExercises)
            .set({ acknowledgementDeadlineAt: new Date(Date.now() - 1_000) })
            .where(eq(ddsExercises.id, item.exercise.id));
        }
        await exercises.transition(item.exercise.id, item.student.user.id, {
          eventId: generateId(),
          status: "accepted",
          comment:
            outcome === 2
              ? "Принято"
              : "Карточка принята, бригада направлена по адресу",
        });
        if (outcome === 2) {
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

      await waitForEvaluations(exercises, issued);
      await lessons.finish(
        { id: instructor.id, role: "instructor" },
        lesson.id,
        generateId(),
      );
      if (plan.daysAgo > 0) await backdateLesson(db, lesson.id, plan.daysAgo);
      const report = await reports.lessonReport(
        { id: instructor.id, role: "instructor" },
        lesson.id,
      );
      finished.push({
        id: lesson.id,
        title: plan.title,
        scores: report.cards.map(({ finalScore }) => finalScore),
      });
    }

    const lastLesson = finished.at(-1)!;
    const insightsStatus = await waitForInsights(db, lastLesson.id);
    const certificate = await prepareCertificate(
      { training, ddsTraining, exercises, catalog },
      instructor.id,
      students[0]!.user.id,
    );

    printResult({
      lessons: finished,
      insightsStatus,
      instructorId: instructor.id,
      groupId: group.id,
      studentId: students[0]!.user.id,
      certificateAssignmentId: certificate,
    });
  } finally {
    await app.close();
  }
}

type Database = DrizzleService["db"];

/** Прошлые демонстрационные занятия удаляются целиком: чужих не трогаем. */
async function removeDemoLessons(db: Database, groupId: string): Promise<void> {
  const rows = await db
    .select({ id: ddsLessons.id })
    .from(ddsLessons)
    .where(eq(ddsLessons.groupId, groupId));
  const ids = rows.map(({ id }) => id);
  if (ids.length === 0) return;
  await db.delete(ddsExercises).where(inArray(ddsExercises.lessonId, ids));
  await db.delete(ddsLessons).where(inArray(ddsLessons.id, ids));
}

async function waitForEvaluations(
  exercises: DdsExerciseService,
  issued: readonly {
    student: { user: { id: string } };
    exercise: DdsExercise;
  }[],
): Promise<void> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const details = await Promise.all(
      issued.map(({ exercise, student }) =>
        exercises.get(exercise.id, student.user.id).catch(() => null),
      ),
    );
    const ready = details
      .filter(Boolean)
      .every(
        (card) =>
          card?.textEvaluation?.status === "done" ||
          card?.textEvaluation?.status === "skipped",
      );
    if (ready) return;
    await wait(1_000);
  }
  throw new Error(
    "Текстовая оценка демо-карточек не завершилась за 180 секунд",
  );
}

/**
 * Сдвигает занятие в прошлое.
 *
 * Баллы и разбор считает система, а вот даты задаёт запуск скрипта: без
 * сдвига все занятия оказались бы сегодняшними, и динамика балла на показе
 * выглядела бы одной точкой.
 */
async function backdateLesson(
  db: Database,
  lessonId: string,
  daysAgo: number,
): Promise<void> {
  const shift = daysAgo * DAY_MS;
  const shifted = (value: Date | null) =>
    value === null ? null : new Date(value.getTime() - shift);
  const [lesson] = await db
    .select()
    .from(ddsLessons)
    .where(eq(ddsLessons.id, lessonId))
    .limit(1);
  if (!lesson) return;
  await db
    .update(ddsLessons)
    .set({
      startedAt: shifted(lesson.startedAt)!,
      finishedAt: shifted(lesson.finishedAt),
    })
    .where(eq(ddsLessons.id, lessonId));
  const cards = await db
    .select()
    .from(ddsExercises)
    .where(eq(ddsExercises.lessonId, lessonId));
  for (const card of cards) {
    await db
      .update(ddsExercises)
      .set({
        createdAt: shifted(card.createdAt)!,
        updatedAt: shifted(card.updatedAt)!,
        acknowledgementDeadlineAt: shifted(card.acknowledgementDeadlineAt)!,
        acknowledgedAt: shifted(card.acknowledgedAt),
        completedAt: shifted(card.completedAt),
      })
      .where(eq(ddsExercises.id, card.id));
    const events = await db
      .select()
      .from(ddsExerciseEvents)
      .where(eq(ddsExerciseEvents.exerciseId, card.id));
    for (const event of events) {
      await db
        .update(ddsExerciseEvents)
        .set({ occurredAt: shifted(event.occurredAt)! })
        .where(eq(ddsExerciseEvents.id, event.id));
    }
  }
}

async function waitForInsights(
  db: Database,
  lessonId: string,
): Promise<string> {
  const deadline = Date.now() + 180_000;
  let status = "pending";
  while (Date.now() < deadline) {
    const [job] = await db
      .select({ status: ddsLessonInsights.status })
      .from(ddsLessonInsights)
      .where(eq(ddsLessonInsights.lessonId, lessonId))
      .limit(1);
    status = job?.status ?? "pending";
    if (["done", "failed"].includes(status)) break;
    await wait(1_000);
  }
  return status;
}

/**
 * Назначение, пройденное до конца: по нему выдаётся сертификат.
 *
 * Карточку диспетчер отрабатывает теми же командами, что и в занятии, — балл
 * считает система, а не скрипт.
 */
async function prepareCertificate(
  services: {
    training: TrainingService;
    ddsTraining: DdsTrainingService;
    exercises: DdsExerciseService;
    catalog: ScenarioCatalog;
  },
  instructorId: string,
  studentId: string,
): Promise<string | null> {
  const { training, ddsTraining, exercises, catalog } = services;
  const published = await catalog.listPublished();
  const scenario = published.find(({ category }) => category === "fire");
  if (!scenario) return null;

  const actor = { id: instructorId, role: "instructor" as const };
  const assignment = await training.createAssignment(actor, {
    title: "Демонстрация: зачёт по карточке ДДС",
    scenarioVersionId: scenario.scenarioVersionId,
    targetUserId: studentId,
    type: "card_action",
    cardSource: "generated",
    serviceTag: "01",
    answerNormSeconds: 30,
    passThreshold: 75,
    maxAttempts: 3,
    dueDate: new Date(Date.now() + 7 * DAY_MS).toISOString(),
  });
  const started = await ddsTraining.start(
    studentId,
    assignment.id,
    generateId(),
  );
  const exerciseId = typeof started === "string" ? started : started.id;
  await exercises.transition(exerciseId, studentId, {
    eventId: generateId(),
    status: "accepted",
    comment: "Принято, бригада направлена по адресу",
  });
  for (const status of [
    "responding",
    "arrived",
    "working",
    "completed",
  ] as const) {
    await exercises.transition(exerciseId, studentId, {
      eventId: generateId(),
      status,
      comment:
        status === "completed"
          ? "Работы завершены, результат передан в смену"
          : undefined,
    });
  }
  await training.completeAssignmentById(actor, assignment.id);
  return assignment.id;
}

function printResult(result: {
  lessons: readonly { id: string; title: string; scores: (number | null)[] }[];
  insightsStatus: string;
  instructorId: string;
  groupId: string;
  studentId: string;
  certificateAssignmentId: string | null;
}): void {
  const baseUrl = process.env.DEMO_APP_URL ?? "http://localhost:5173";
  console.log("Демонстрационные данные готовы.");
  for (const lesson of result.lessons) {
    console.log(`${lesson.title}`);
    console.log(`  отчёт: ${baseUrl}/dds-lessons/${lesson.id}/report`);
    console.log(
      `  баллы: ${lesson.scores.map((score) => score ?? "ожидается").join(", ")}`,
    );
  }
  console.log(`Выводы ИИ по последнему занятию: ${result.insightsStatus}`);
  console.log(`Отчёты преподавателя: ${baseUrl}/reports`);
  console.log(`Карточка обучающегося: ${baseUrl}/students/${result.studentId}`);
  console.log(
    result.certificateAssignmentId
      ? `Сертификат: ${baseUrl}/students/${result.studentId} → «Сертификат» у назначения ${result.certificateAssignmentId}`
      : "Сертификат не подготовлен: нет опубликованного сценария категории «пожар»",
  );
  console.log(
    `Учётные записи: dds-demo-instructor@example.test и dds-demo-01…03@example.test, пароль ${PASSWORD}.`,
  );
  console.log("Убрать данные показа: bun run demo:reset");
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
