import { NestFactory } from "@nestjs/core";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";

import { AppException } from "@/common/exceptions/app.exception";
import { generateId } from "@/common/utils/id";
import { ErrorCodes } from "@/contracts";
import { CoreModule } from "@/core/core.module";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  callEvents,
  callStates,
  ddsExercises,
  scenarios,
  scenarioVersions,
  trainingAssignments,
  trainingAttempts,
  trainingGroups,
  users,
} from "@/drizzle/schema";
import { AuthService } from "@/modules/auth/auth.service";
import { ScenarioEngineService } from "@/modules/scenario-engine";
import { DdsExerciseService } from "@/modules/dds-exercise/application/dds-exercise.service";
import { DdsTrainingService } from "@/modules/dds-exercise/application/dds-training.service";
import { TrainingService } from "@/modules/training/training.service";

/**
 * Ручная проверка групп, назначений и попыток на реальной базе.
 *
 * Юнит-тесты работают на стабе Drizzle, поэтому подзапросы ownership,
 * блокировка назначения и частичный уникальный индекс попыток проверяются
 * только здесь. Всё созданное удаляется в конце.
 *
 *   docker compose up -d postgres && bun run db:migrate && bun run db:seed
 *   bun run smoke:training
 */
const SCENARIO_CODE = "S-015";

const step = (message: string): void => {
  console.log(`• ${message}`);
};

const expectCode = async (
  promise: Promise<unknown>,
  code: string,
  what: string,
): Promise<void> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException && error.code === code) {
      step(`${what}: ${code}`);
      return;
    }
    throw error;
  }
  throw new Error(`${what}: ожидался отказ ${code}`);
};

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(CoreModule, {
    logger: ["error", "warn"],
  });

  const training = app.get(TrainingService);
  const auth = app.get(AuthService);
  const engine = app.get(ScenarioEngineService);
  const ddsExerciseService = app.get(DdsExerciseService);
  const ddsTraining = app.get(DdsTrainingService);
  const db = app.get<DrizzleService["db"]>(DRIZZLE);
  const suffix = generateId().slice(0, 8);
  const userIds = {
    instructor: generateId(),
    otherInstructor: generateId(),
    fire: generateId(),
    medic: generateId(),
  };
  const sessionIds: string[] = [];

  try {
    const [version] = await db
      .select({ id: scenarioVersions.id })
      .from(scenarioVersions)
      .innerJoin(scenarios, eq(scenarioVersions.scenarioId, scenarios.id))
      .where(
        and(
          eq(scenarios.code, SCENARIO_CODE),
          eq(scenarios.status, "published"),
          isNotNull(scenarioVersions.publishedAt),
        ),
      )
      .orderBy(desc(scenarioVersions.publishedAt))
      .limit(1);
    if (!version) {
      throw new Error(
        `Сценарий ${SCENARIO_CODE} не найден — выполните db:seed`,
      );
    }

    await db.insert(users).values(
      Object.entries(userIds).map(([key, id]) => ({
        id,
        email: `smoke-${key}-${suffix}@training.test`,
        passwordHash: "smoke",
        fullName: `Smoke ${key}`,
        role: key.endsWith("nstructor")
          ? ("instructor" as const)
          : ("operator" as const),
      })),
    );
    const instructor = { id: userIds.instructor, role: "instructor" as const };
    const stranger = {
      id: userIds.otherInstructor,
      role: "instructor" as const,
    };

    const group = await training.createGroup(instructor, {
      name: `Smoke ${suffix}`,
      code: `SMOKE-${suffix}`.toUpperCase(),
      organization: "Smoke",
    });
    await training.addMember(instructor, group.id, {
      userId: userIds.fire,
      serviceTag: "FIRE_101",
    });
    await training.addMember(instructor, group.id, {
      userId: userIds.medic,
      serviceTag: "MED_103",
    });
    await expectCode(
      training.addMember(instructor, group.id, {
        userId: userIds.fire,
        serviceTag: "FIRE_101",
      }),
      ErrorCodes.GROUP_MEMBER_EXISTS,
      "повторное добавление отклонено",
    );
    step("группа создана, в ней пожарный и медик");

    const draft = await training.createAssignment(instructor, {
      title: "Smoke: пожар",
      scenarioVersionId: version.id,
      groupId: group.id,
      type: "voice_call",
      cardSource: "ticket",
      serviceTag: "FIRE_101",
      answerNormSeconds: 240,
      passThreshold: 75,
      maxAttempts: 2,
      dueDate: null,
    });
    await training.updateAssignment(instructor, draft.id, {
      title: "Smoke: пожар в доме",
    });
    await expectCode(
      training.launchAssignmentById(stranger, draft.id),
      ErrorCodes.AUTH_ROLE_FORBIDDEN,
      "чужой преподаватель не запускает занятие",
    );
    await training.launchAssignmentById(instructor, draft.id);
    await expectCode(
      training.updateAssignment(instructor, draft.id, { title: "Поздно" }),
      ErrorCodes.ASSIGNMENT_STATE_INVALID,
      "идущее занятие не правится",
    );
    step("черновик поправлен и запущен");

    const fireFeed = await training.listMyAssignments(userIds.fire);
    const medicFeed = await training.listMyAssignments(userIds.medic);
    if (!fireFeed.some(({ id }) => id === draft.id)) {
      throw new Error("пожарный не видит назначение своей службы");
    }
    if (medicFeed.some(({ id }) => id === draft.id)) {
      throw new Error("медик видит назначение чужой службы");
    }
    step("лента учитывает службу обучающегося");

    const startAttempt = async () => {
      const trainingSessionId = generateId();
      sessionIds.push(trainingSessionId);
      const number = await training.reserveAttempt({
        assignmentId: draft.id,
        operatorId: userIds.fire,
        scenarioVersionId: version.id,
        trainingSessionId,
      });
      await engine.startCall({
        trainingSessionId,
        scenarioVersionId: version.id,
        eventId: generateId(),
        operatorId: userIds.fire,
      });
      return { trainingSessionId, number };
    };

    const concurrent = await Promise.allSettled([
      startAttempt(),
      startAttempt(),
    ]);
    const started = concurrent.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    const refused = concurrent.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (
      started.length !== 1 ||
      !(refused[0] instanceof AppException) ||
      refused[0].code !== ErrorCodes.ASSIGNMENT_ATTEMPT_ACTIVE
    ) {
      throw new Error(
        `одновременный старт: ожидалась одна попытка, получено ${started.length}`,
      );
    }
    const first = started[0]!;
    step(
      `из двух одновременных стартов прошёл один, попытка № ${first.number}`,
    );

    const live = await training.listLiveSessions(instructor, group.id);
    if (!live.some((s) => s.trainingSessionId === first.trainingSessionId)) {
      throw new Error("преподаватель не видит идущий звонок группы");
    }
    if ((await training.listLiveSessions(stranger)).length > 0) {
      throw new Error("чужой преподаватель видит звонки группы");
    }
    step("мониторинг видит звонок только у своего преподавателя");

    await expectCode(
      training.completeAssignmentById(instructor, draft.id),
      ErrorCodes.ASSIGNMENT_HAS_ACTIVE_ATTEMPTS,
      "занятие с идущим звонком не завершается",
    );

    await engine.endCallByInstructor({
      trainingSessionId: first.trainingSessionId,
      eventId: generateId(),
      instructorId: instructor.id,
      reason: "smoke",
    });
    if (
      !(await training.finishAttempt(
        first.trainingSessionId,
        "cancelled_by_instructor",
      ))
    ) {
      throw new Error("активная попытка не закрылась");
    }
    if (await training.finishAttempt(first.trainingSessionId, "abandoned")) {
      throw new Error("поздний обрыв перезаписал итог попытки");
    }
    step("звонок остановлен преподавателем, поздний обрыв итог не меняет");

    // Звонок, закрытый без gateway (например, уборкой после падения), не
    // должен держать оператора: следующая попытка закрывает такую сироту.
    const orphan = await startAttempt();
    await engine.declineCall({
      trainingSessionId: orphan.trainingSessionId,
      eventId: generateId(),
    });
    await expectCode(
      startAttempt(),
      ErrorCodes.ASSIGNMENT_MAX_ATTEMPTS_REACHED,
      "третья попытка при лимите 2",
    );
    const [orphanRow] = await db
      .select({ status: trainingAttempts.status })
      .from(trainingAttempts)
      .where(eq(trainingAttempts.trainingSessionId, orphan.trainingSessionId));
    if (orphanRow?.status !== "abandoned") {
      throw new Error(`осиротевшая попытка осталась ${orphanRow?.status}`);
    }
    step("осиротевшая попытка закрыта как прерванная");

    const ddsAssignment = await training.createAssignment(instructor, {
      title: "Smoke: карточка ДДС",
      scenarioVersionId: version.id,
      groupId: group.id,
      type: "card_action",
      cardSource: "ticket",
      serviceTag: "FIRE_101",
      answerNormSeconds: 240,
      passThreshold: 75,
      maxAttempts: 1,
      dueDate: null,
    });
    await training.launchAssignmentById(instructor, ddsAssignment.id);
    const ddsStartEvent = generateId();
    const dds = await ddsTraining.start(
      userIds.fire,
      ddsAssignment.id,
      ddsStartEvent,
    );
    const repeatedDds = await ddsTraining.start(
      userIds.fire,
      ddsAssignment.id,
      ddsStartEvent,
    );
    if (dds.id !== repeatedDds.id) {
      throw new Error("повтор старта ДДС создал вторую карточку");
    }
    if (
      !(await ddsTraining.live(instructor)).attempts.some(
        ({ exerciseId }) => exerciseId === dds.id,
      )
    ) {
      throw new Error("преподаватель не видит активную карточку ДДС");
    }
    if (
      (await ddsTraining.live(stranger)).attempts.some(
        ({ exerciseId }) => exerciseId === dds.id,
      )
    ) {
      throw new Error("чужой преподаватель видит активную карточку ДДС");
    }
    await ddsExerciseService.transition(dds.id, userIds.fire, {
      eventId: generateId(),
      status: "accepted",
    });
    await ddsExerciseService.transition(dds.id, userIds.fire, {
      eventId: generateId(),
      status: "responding",
    });
    await ddsExerciseService.transition(dds.id, userIds.fire, {
      eventId: generateId(),
      status: "arrived",
    });
    await ddsExerciseService.transition(dds.id, userIds.fire, {
      eventId: generateId(),
      status: "working",
    });
    await ddsExerciseService.transition(dds.id, userIds.fire, {
      eventId: generateId(),
      status: "completed",
    });
    await ddsTraining.review(instructor, dds.id, {
      eventId: generateId(),
      score: 88,
      comment: "Smoke review",
    });
    const [reviewed] = (await ddsTraining.list(instructor)).attempts.filter(
      ({ exercise }) => exercise.id === dds.id,
    );
    if (
      reviewed?.attemptStatus !== "completed" ||
      reviewed.reviews[0]?.score !== 88
    ) {
      throw new Error(
        "завершённая попытка ДДС не дошла до оценки преподавателя",
      );
    }
    step("назначенная карточка ДДС запускается, завершается и оценивается");

    const calls = await training.listInstructorCalls(instructor, {
      groupId: group.id,
    });
    if (calls.length !== 2) {
      throw new Error(`в разборах ${calls.length} попыток вместо 2`);
    }
    const managed = await training.requireManagedSession(
      instructor,
      first.trainingSessionId,
    );
    if (managed.operatorId !== userIds.fire) {
      throw new Error("разбор открылся не на того оператора");
    }
    await expectCode(
      training.requireManagedSession(stranger, first.trainingSessionId),
      ErrorCodes.CALL_NOT_FOUND,
      "чужой преподаватель не открывает разбор",
    );
    step(`в разборах группы ${calls.length} попытки`);

    const students = await training.listGroupStudents(instructor, group.id);
    const fireStats = students.find(({ userId }) => userId === userIds.fire);
    if (fireStats?.stats.attempts !== 2) {
      throw new Error(
        `у ученика ${fireStats?.stats.attempts} попыток вместо 2`,
      );
    }
    const profile = await training.requireManagedStudent(
      instructor,
      userIds.fire,
    );
    if (profile.groups[0]?.serviceTag !== "FIRE_101") {
      throw new Error("в профиле ученика нет его группы и службы");
    }
    const strangerView = await training.requireManagedStudent(
      stranger,
      userIds.fire,
    );
    if (strangerView.groups.length > 0) {
      throw new Error("чужой преподаватель видит группы ученика");
    }
    const strangerCalls = await training.listInstructorCalls(stranger, {
      operatorId: userIds.fire,
    });
    if (strangerCalls.length > 0) {
      throw new Error("чужой преподаватель видит звонки ученика");
    }
    const everyone = await training.listStudents(stranger);
    const listed = everyone.find(({ id }) => id === userIds.fire);
    if (!listed || listed.groups.length > 0 || listed.stats.attempts > 0) {
      throw new Error("в общем списке чужой преподаватель видит лишнее");
    }
    step("чужой преподаватель видит ученика, но не его группы и звонки");

    await training.removeMember(instructor, group.id, userIds.medic);
    const afterRemoval = await training.listStudents(instructor);
    const medic = afterRemoval.find(({ id }) => id === userIds.medic);
    if (!medic || medic.groups.length > 0) {
      throw new Error("исключённый ученик пропал из списка учеников");
    }
    step("исключённый из группы ученик остаётся в списке учеников");

    const individual = await training.createAssignment(instructor, {
      title: "Smoke: индивидуально",
      scenarioVersionId: version.id,
      targetUserId: userIds.medic,
      type: "voice_call",
      cardSource: "mixed",
      serviceTag: null,
      answerNormSeconds: 240,
      passThreshold: 75,
      maxAttempts: 1,
      dueDate: null,
    });
    await training.launchAssignmentById(instructor, individual.id);
    const medicLessons = await training.listMyAssignments(userIds.medic);
    if (
      !medicLessons.some(
        ({ id, cardSource }) => id === individual.id && cardSource === "mixed",
      )
    ) {
      throw new Error("ученик вне группы не видит своё индивидуальное занятие");
    }
    await training.completeAssignmentById(instructor, individual.id);
    step("индивидуальное занятие со смешанными карточками дошло до ученика");
    step("статистика ученика по группе и его профиль доступны");

    const renamed = await training.updateGroup(instructor, group.id, {
      name: `Smoke ${suffix} renamed`,
      code: `SMOKE-R-${suffix}`.toUpperCase(),
      organization: "Smoke 2",
    });
    if (renamed.code !== `SMOKE-R-${suffix}`.toUpperCase()) {
      throw new Error("код группы не сменился");
    }
    await expectCode(
      training.updateGroup(instructor, group.id, {
        instructorId: userIds.otherInstructor,
      }),
      ErrorCodes.AUTH_ROLE_FORBIDDEN,
      "преподаватель не передаёт группу",
    );
    const moved = await training.updateGroup(
      { id: userIds.instructor, role: "admin" },
      group.id,
      { instructorId: userIds.otherInstructor },
    );
    if (moved.instructorId !== userIds.otherInstructor) {
      throw new Error("группа не перешла к другому преподавателю");
    }
    // Возвращаем группу: дальше смоук идёт от имени первого преподавателя.
    await training.updateGroup(
      { id: userIds.instructor, role: "admin" },
      group.id,
      {
        instructorId: userIds.instructor,
      },
    );
    step("группа переименована, код сменён, администратор передал группу");

    const edited = await auth.updateUser(userIds.fire, {
      fullName: "Smoke fire renamed",
      email: `smoke-fire-renamed-${suffix}@training.test`,
      password: "Renamed123",
    });
    if (edited.fullName !== "Smoke fire renamed") {
      throw new Error("ФИО ученика не сменилось");
    }
    step("учётная запись ученика изменена, сессии отозваны");

    await training.completeAssignmentById(instructor, draft.id);
    await training.archiveAssignmentById(instructor, draft.id);
    await expectCode(
      training.deleteGroup(instructor, group.id),
      ErrorCodes.GROUP_HAS_ASSIGNMENTS,
      "группа с назначениями не удаляется",
    );
    step("занятие завершено и отправлено в архив");

    console.log("\nгруппы, назначения и попытки работают на живой базе");
  } finally {
    if (sessionIds.length > 0) {
      await db
        .delete(callEvents)
        .where(inArray(callEvents.trainingSessionId, sessionIds));
      await db
        .delete(callStates)
        .where(inArray(callStates.trainingSessionId, sessionIds));
    }
    // Назначенная карточка хранит попытку как интеграционный идентификатор, а
    // не FK. Удаляем её явно: события и оценки уйдут каскадом, и тестовые
    // преподаватели не останутся заняты ссылкой из review.
    await db
      .delete(ddsExercises)
      .where(inArray(ddsExercises.operatorId, Object.values(userIds)));
    // Группы, назначения и попытки уходят каскадом, а преподавателя группа
    // держит `restrict`, поэтому сначала группы и назначения.
    await db
      .delete(trainingAssignments)
      .where(inArray(trainingAssignments.createdBy, Object.values(userIds)));
    await db
      .delete(trainingGroups)
      .where(inArray(trainingGroups.instructorId, Object.values(userIds)));
    await db.delete(users).where(inArray(users.id, Object.values(userIds)));
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
