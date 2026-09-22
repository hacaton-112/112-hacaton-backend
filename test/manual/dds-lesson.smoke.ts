import { NestFactory } from "@nestjs/core";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";

import { generateId } from "@/common/utils/id";
import { CoreModule } from "@/core/core.module";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  callStates,
  ddsCardReferences,
  ddsExercises,
  ddsLessonInsights,
  ddsLessons,
  incidentCards,
  scenarios,
  scenarioVersions,
  trainingGroupMembers,
  trainingGroups,
  users,
  type DdsCardReferenceRecord,
} from "@/drizzle/schema";
import { DdsExerciseService } from "@/modules/dds-exercise/application/dds-exercise.service";
import { DdsDispatchService } from "@/modules/dds-exercise/application/dds-dispatch.service";
import { DdsLessonService } from "@/modules/dds-exercise/application/dds-lesson.service";
import { DdsReportService } from "@/modules/dds-exercise/application/dds-report.service";
import { DdsReferenceService } from "@/modules/dds-exercise/application/dds-reference.service";
import { DdsTrainingService } from "@/modules/dds-exercise/application/dds-training.service";
import { ReportExporter } from "@/modules/reports/infrastructure/report-exporter";

const step = (message: string): void => console.log(`• ${message}`);

/**
 * Сквозная проверка потока занятия на настоящей PostgreSQL.
 * Карточка очереди создаётся в том же виде, который фиксирует отправка оператором 112:
 * без владельца и попытки, но с исходной учебной сессией.
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(CoreModule, {
    logger: ["error", "warn"],
  });
  const db = app.get<DrizzleService["db"]>(DRIZZLE);
  const lessons = app.get(DdsLessonService);
  const dispatches = app.get(DdsDispatchService);
  const exercises = app.get(DdsExerciseService);
  const monitoring = app.get(DdsTrainingService);
  const references = app.get(DdsReferenceService);
  const reports = app.get(DdsReportService);
  const exporter = app.get(ReportExporter);
  const withoutLlm = process.argv.includes("--without-llm");
  const suffix = generateId().slice(0, 8);
  const ids = {
    instructor: generateId(),
    student: generateId(),
    operator112: generateId(),
    group: generateId(),
    sourceSession: generateId(),
  };
  let lessonId: string | null = null;
  let originalReference: DdsCardReferenceRecord | null = null;
  let scenarioVersionId: string | null = null;

  try {
    const [version] = await db
      .select({ id: scenarioVersions.id })
      .from(scenarioVersions)
      .innerJoin(scenarios, eq(scenarios.id, scenarioVersions.scenarioId))
      .where(
        and(
          eq(scenarios.category, "fire"),
          eq(scenarios.status, "published"),
          isNotNull(scenarioVersions.publishedAt),
        ),
      )
      .orderBy(desc(scenarioVersions.publishedAt))
      .limit(1);
    if (!version)
      throw new Error(
        "Нет опубликованного сценария категории fire — выполните db:seed",
      );
    await db.insert(users).values([
      {
        id: ids.instructor,
        email: `lesson-instructor-${suffix}@training.test`,
        passwordHash: "smoke",
        fullName: "Преподаватель smoke",
        role: "instructor",
      },
      {
        id: ids.operator112,
        email: `lesson-operator-${suffix}@training.test`,
        passwordHash: "smoke",
        fullName: "Оператор 112 smoke",
        role: "operator",
      },
      {
        id: ids.student,
        email: `lesson-student-${suffix}@training.test`,
        passwordHash: "smoke",
        fullName: "Диспетчер smoke",
        role: "operator",
      },
    ]);
    await db.insert(trainingGroups).values({
      id: ids.group,
      instructorId: ids.instructor,
      name: `Занятие ${suffix}`,
      code: `LESSON-${suffix}`.toUpperCase(),
      organization: "Smoke",
    });
    await db.insert(trainingGroupMembers).values({
      id: generateId(),
      groupId: ids.group,
      userId: ids.student,
      serviceTag: "01",
    });

    const lesson = await lessons.create(
      { id: ids.instructor, role: "instructor" },
      {
        eventId: generateId(),
        groupId: ids.group,
        title: "Smoke: смешанный поток",
        categories: ["fire"],
        cardSource: "mixed",
        acknowledgementNormSeconds: 45,
        passThreshold: 75,
      },
    );
    lessonId = lesson.id;
    step("преподаватель запустил смешанное занятие на группу");

    const first = await lessons.next(ids.student, lesson.id, generateId());
    if (first.status !== "ready" || !first.exercise)
      throw new Error(first.reason ?? "The first card was not issued");
    const firstExercise = first.exercise;
    scenarioVersionId = firstExercise.scenarioVersionId;
    const [storedReference] = await db
      .select()
      .from(ddsCardReferences)
      .where(eq(ddsCardReferences.scenarioVersionId, scenarioVersionId))
      .limit(1);
    originalReference = storedReference ?? null;
    if (withoutLlm) {
      await db
        .insert(ddsCardReferences)
        .values({
          id: generateId(),
          scenarioVersionId,
          expectedOutcome: "accept",
          requiredItems: [],
          status: "draft",
        })
        .onConflictDoUpdate({
          target: ddsCardReferences.scenarioVersionId,
          targetWhere: isNotNull(ddsCardReferences.scenarioVersionId),
          set: { requiredItems: [], status: "draft", approvedAt: null },
        });
      step("эталон отключён флагом --without-llm");
    } else {
      const generated = await references.getScenario(scenarioVersionId);
      await references.update(
        { id: ids.instructor, role: "instructor" },
        scenarioVersionId,
        {
          eventId: generateId(),
          expectedOutcome: generated.expectedOutcome,
          refusalReasons: generated.refusalReasons,
          requiredItems: generated.requiredItems,
          expectedCrewService: generated.expectedCrewService,
          approveAll: true,
        },
      );
      step("эталон сценария подготовлен и подтверждён");
    }
    await exercises.transition(firstExercise.id, ids.student, {
      eventId: generateId(),
      status: "accepted",
      comment:
        "Сообщение принято, пожарная бригада направлена по учебному адресу",
    });
    // Текст оценивается по завершении карточки, а не на каждом статусе.
    await exercises.transition(firstExercise.id, ids.student, {
      eventId: generateId(),
      status: "refused",
      comment: "Учебная карточка обработана",
    });
    step("ученик завершил сгенерированную карточку");
    let evaluated = await exercises.get(firstExercise.id, ids.student);
    const evaluationDeadline = Date.now() + 130_000;
    while (
      (!evaluated.textEvaluation ||
        evaluated.textEvaluation.status === "pending") &&
      Date.now() < evaluationDeadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      evaluated = await exercises.get(firstExercise.id, ids.student);
    }
    if (withoutLlm) {
      if (evaluated.textEvaluation?.status !== "skipped")
        throw new Error("Путь без оценки текста не перешёл в skipped");
    } else if (
      evaluated.textEvaluation?.status !== "done" ||
      evaluated.textEvaluation.coverage.length === 0 ||
      evaluated.textEvaluation.grammar === null ||
      evaluated.result === null
    ) {
      throw new Error(
        "Асинхронная оценка текста не сформировала полный результат",
      );
    }
    step(
      withoutLlm
        ? "карточка оценена прежней формулой без текста"
        : "получены покрытие эталона, грамотность и итоговый балл",
    );

    const now = new Date();
    await db.insert(callStates).values({
      trainingSessionId: ids.sourceSession,
      scenarioVersionId: version.id,
      operatorId: ids.operator112,
      stage: "conversation",
      panicLevel: 1,
      rngSeed: suffix,
      offeredAt: now,
    });
    await db.insert(incidentCards).values({
      trainingSessionId: ids.sourceSession,
      callerAnonymous: true,
      latitude: "55.752000",
      longitude: "37.617000",
      addressText: "Учебный адрес",
      incidentType: "Пожар",
      description: "Учебная карточка оператора 112",
      classifierRouting: {
        classifierVersionId: "smoke",
        classifierEntryId: "smoke",
        sourceCode: "SMOKE",
        featurePath: ["Пожар"],
        finalType: "Пожар",
        ekpType: null,
        mainServiceCode: "dds_01",
        qualifierCodes: [],
        requiredServices: [],
      },
      services: ["dds_01"],
    });
    await dispatches.dispatch(ids.sourceSession, ids.operator112, {
      eventId: generateId(),
    });
    step("карточка оператора 112 поступила в очередь службы");

    const second = await lessons.next(ids.student, lesson.id, generateId());
    if (
      second.status !== "ready" ||
      !second.exercise ||
      second.exercise.sourceTrainingSessionId === null
    ) {
      throw new Error("Смешанный поток не выдал карточку из очереди");
    }
    const secondExercise = second.exercise;
    await exercises.transition(secondExercise.id, ids.student, {
      eventId: generateId(),
      status: "accepted",
    });
    await exercises.transition(secondExercise.id, ids.student, {
      eventId: generateId(),
      status: "refused",
      comment: "Учебная карточка обработана",
    });
    const third = await lessons.next(ids.student, lesson.id, generateId());
    if (
      third.status !== "ready" ||
      !third.exercise ||
      third.exercise.sourceTrainingSessionId !== null
    ) {
      throw new Error("Смешанный поток не вернулся к генерации");
    }
    const thirdExercise = third.exercise;
    step("ученик получил три чередующиеся карточки, третья оставлена открытой");

    const live = await monitoring.live(
      { id: ids.instructor, role: "instructor" },
      { groupId: ids.group, lessonId: lesson.id },
    );
    if (
      !live.lessonAttempts.some(
        ({ exerciseId }) => exerciseId === thirdExercise.id,
      )
    ) {
      throw new Error("Открытая карточка занятия не видна в мониторинге");
    }
    const finished = await lessons.finish(
      { id: ids.instructor, role: "instructor" },
      lesson.id,
      generateId(),
    );
    const closed = finished.cards.find(
      ({ exercise }) => exercise.id === thirdExercise.id,
    );
    if (
      closed?.exercise.status !== "lesson_finished" ||
      closed.exercise.result !== null
    ) {
      throw new Error("Незавершённая карточка закрылась со штрафной оценкой");
    }
    step(
      "преподаватель завершил занятие; открытая карточка закрыта без штрафа",
    );

    const report = await reports.lessonReport(
      { id: ids.instructor, role: "instructor" },
      lesson.id,
    );
    if (report.cards.length !== 3 || report.students.length !== 1)
      throw new Error("Отчёт не собрал карточки и участника занятия");
    for (const format of ["pdf", "xlsx", "csv"] as const) {
      const artifact = await exporter.exportDdsLesson(report, format);
      if (artifact.buffer.length === 0)
        throw new Error(`Выгрузка ${format} оказалась пустой`);
    }
    const [insightsJob] = await db
      .select({ status: ddsLessonInsights.status })
      .from(ddsLessonInsights)
      .where(eq(ddsLessonInsights.lessonId, lesson.id))
      .limit(1);
    if (!insightsJob)
      throw new Error("После завершения занятия не создана задача выводов");
    step("отчёт собран, три формата выгружены, выводы поставлены в фон");
  } finally {
    if (lessonId)
      await db.delete(ddsExercises).where(eq(ddsExercises.lessonId, lessonId));
    await db
      .delete(ddsExercises)
      .where(eq(ddsExercises.sourceTrainingSessionId, ids.sourceSession));
    if (lessonId)
      await db.delete(ddsLessons).where(eq(ddsLessons.id, lessonId));
    if (originalReference) {
      await db
        .update(ddsCardReferences)
        .set({
          expectedOutcome: originalReference.expectedOutcome,
          refusalReasons: originalReference.refusalReasons,
          requiredItems: originalReference.requiredItems,
          expectedCrewService: originalReference.expectedCrewService,
          status: originalReference.status,
          version: originalReference.version,
          approvedBy: originalReference.approvedBy,
          approvedAt: originalReference.approvedAt,
          generationComment: originalReference.generationComment,
          leaseOwner: originalReference.leaseOwner,
          leaseUntil: originalReference.leaseUntil,
          attemptCount: originalReference.attemptCount,
          error: originalReference.error,
          updatedAt: originalReference.updatedAt,
        })
        .where(eq(ddsCardReferences.id, originalReference.id));
    } else if (scenarioVersionId) {
      await db
        .delete(ddsCardReferences)
        .where(eq(ddsCardReferences.scenarioVersionId, scenarioVersionId));
    }
    await db
      .delete(callStates)
      .where(eq(callStates.trainingSessionId, ids.sourceSession));
    await db.delete(trainingGroups).where(eq(trainingGroups.id, ids.group));
    await db
      .delete(users)
      .where(inArray(users.id, [ids.instructor, ids.student, ids.operator112]));
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
  });
