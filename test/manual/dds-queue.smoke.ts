import { NestFactory } from "@nestjs/core";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";

import { generateId } from "@/common/utils/id";
import { CoreModule } from "@/core/core.module";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  callEvents,
  callStates,
  ddsExercises,
  incidentCards,
  scenarios,
  scenarioVersions,
  trainingAssignments,
  trainingAttempts,
  trainingGroups,
  users,
} from "@/drizzle/schema";
import { DdsDispatchService } from "@/modules/dds-exercise/application/dds-dispatch.service";
import { DdsExerciseService } from "@/modules/dds-exercise/application/dds-exercise.service";
import { DdsTrainingService } from "@/modules/dds-exercise/application/dds-training.service";
import { ScenarioEngineService } from "@/modules/scenario-engine";
import { TrainingService } from "@/modules/training/application/training.service";

/**
 * Ручная проверка доставки карточки из 112 в дежурную смену ДДС.
 *
 * Стык проходит целиком по SQL: условие очереди, закрепление владельца и
 * выборка кабинета преподавателя. Юнит-тесты работают на стабе Drizzle и
 * поэтому его не видят — отсюда и этот прогон на настоящей базе.
 *
 *   docker compose up -d postgres && bun run db:migrate && bun run db:seed
 *   bun run smoke:dds-queue
 */
const SCENARIO_CODE = "S-015";

const step = (message: string): void => {
  console.log(`• ${message}`);
};

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(CoreModule, {
    logger: ["error", "warn"],
  });

  const training = app.get(TrainingService);
  const engine = app.get(ScenarioEngineService);
  const dispatches = app.get(DdsDispatchService);
  const exercises = app.get(DdsExerciseService);
  const ddsTraining = app.get(DdsTrainingService);
  const db = app.get<DrizzleService["db"]>(DRIZZLE);
  const suffix = generateId().slice(0, 8);
  const userIds = {
    instructor: generateId(),
    operator: generateId(),
    onDuty: generateId(),
    otherService: generateId(),
  };
  const trainingSessionId = generateId();

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
      throw new Error(`Сценарий ${SCENARIO_CODE} не найден — выполните db:seed`);
    }

    await db.insert(users).values(
      Object.entries(userIds).map(([key, id]) => ({
        id,
        email: `queue-${key}-${suffix}@training.test`,
        passwordHash: "smoke",
        fullName: `Queue ${key}`,
        role: key === "instructor" ? ("instructor" as const) : ("operator" as const),
      })),
    );
    const instructor = { id: userIds.instructor, role: "instructor" as const };

    // Диспетчер ведёт две службы сразу: так проверяется, что он может взять
    // обе доставки одной отправки.
    const shift = await training.createGroup(instructor, {
      name: `Смена ${suffix}`,
      code: `QUEUE-${suffix}`.toUpperCase(),
      organization: "Smoke",
    });
    const medics = await training.createGroup(instructor, {
      name: `Медики ${suffix}`,
      code: `QUEUE-MED-${suffix}`.toUpperCase(),
      organization: "Smoke",
    });
    await training.addMember(instructor, shift.id, {
      userId: userIds.onDuty,
      serviceTag: "01",
    });
    await training.addMember(instructor, medics.id, {
      userId: userIds.onDuty,
      serviceTag: "03",
    });
    await training.addMember(instructor, shift.id, {
      userId: userIds.otherService,
      serviceTag: "02",
    });
    await training.addMember(instructor, shift.id, {
      userId: userIds.operator,
      serviceTag: "112",
    });
    step("смена собрана: диспетчер на 01 и 03, второй на 02");

    // Оператор 112 работает по назначению: именно в этом случае доставка
    // раньше наследовала его попытку и пропадала из очереди.
    const assignment = await training.createAssignment(instructor, {
      title: "Smoke: приём вызова",
      scenarioVersionId: version.id,
      groupId: shift.id,
      type: "voice_call",
      cardSource: "ticket",
      serviceTag: "112",
      answerNormSeconds: 240,
      passThreshold: 75,
      maxAttempts: 1,
      dueDate: null,
    });
    await training.launchAssignmentById(instructor, assignment.id);
    await training.reserveAttempt({
      assignmentId: assignment.id,
      operatorId: userIds.operator,
      scenarioVersionId: version.id,
      trainingSessionId,
    });
    await engine.startCall({
      trainingSessionId,
      scenarioVersionId: version.id,
      eventId: generateId(),
      operatorId: userIds.operator,
    });
    // Карточка отправляется из разговора, поэтому вызов нужно принять.
    await engine.acceptCall({ trainingSessionId, eventId: generateId() });
    await db.insert(incidentCards).values({
      trainingSessionId,
      callerAnonymous: true,
      callerPhone: "+79990000000",
      addressText: "Москва, улица Миклухо-Маклая, 2",
      latitude: "55.648000",
      longitude: "37.530000",
      incidentType: "Пожар в жилом доме",
      classifierRouting: {
        classifierVersionId: "smoke",
        classifierEntryId: "smoke",
        sourceCode: "SMOKE",
        featurePath: ["Пожар"],
        finalType: "Пожар в жилом доме",
        ekpType: null,
        mainServiceCode: "dds_01",
        qualifierCodes: [],
        requiredServices: [],
      },
      description: "Горит квартира на третьем этаже",
      victimsTotal: 1,
      services: ["dds_01", "dds_03"],
    });
    const receipt = await dispatches.dispatch(trainingSessionId, userIds.operator, {
      eventId: generateId(),
    });
    if (receipt.deliveries.length !== 2) {
      throw new Error(
        `отправлено ${receipt.deliveries.length} доставок вместо 2`,
      );
    }
    step("оператор 112 отправил карточку в две службы");

    // В базе могут лежать чужие карточки, поэтому сверяем только свои.
    const delivered = new Set(receipt.deliveries.map(({ id }) => id));
    const mine = (list: readonly { id: string }[]) =>
      list.filter(({ id }) => delivered.has(id));
    const queue = mine(await exercises.list(userIds.onDuty));
    if (queue.length !== 2) {
      throw new Error(`дежурный видит ${queue.length} своих карточек вместо 2`);
    }
    if (mine(await exercises.list(userIds.otherService)).length > 0) {
      throw new Error("карточку видит диспетчер чужой службы");
    }
    step("карточка дошла до дежурного своей службы и только до него");

    for (const delivery of receipt.deliveries) {
      await exercises.transition(delivery.id, userIds.onDuty, {
        eventId: generateId(),
        status: "accepted",
      });
    }
    const owners = await db
      .select({ id: ddsExercises.id, operatorId: ddsExercises.operatorId })
      .from(ddsExercises)
      .where(eq(ddsExercises.sourceTrainingSessionId, trainingSessionId));
    if (owners.some(({ operatorId }) => operatorId !== userIds.onDuty)) {
      throw new Error("принятая карточка не закрепилась за диспетчером");
    }
    step("обе доставки одной отправки закрепились за принявшим их диспетчером");

    const watching = await ddsTraining.live(instructor);
    const watched = watching.standaloneAttempts.filter(({ exerciseId }) =>
      delivered.has(exerciseId),
    );
    if (watched.length !== 2) {
      throw new Error(
        `мониторинг показывает ${watched.length} идущих карточек очереди вместо 2`,
      );
    }
    step("преподаватель видит работу по карточкам очереди в мониторинге");

    const [operatorAttempt] = await db
      .select({ status: trainingAttempts.status })
      .from(trainingAttempts)
      .where(eq(trainingAttempts.trainingSessionId, trainingSessionId));
    if (operatorAttempt === undefined || operatorAttempt.status === "completed") {
      throw new Error(
        `занятие оператора 112 стало ${operatorAttempt?.status} из-за чужой карточки`,
      );
    }
    step("занятие оператора 112 карточкой диспетчера не закрывается");

    const closed = receipt.deliveries[0]!;
    await exercises.transition(closed.id, userIds.onDuty, {
      eventId: generateId(),
      status: "refused",
      comment: "Ложный вызов, выезд не требуется",
    });
    const visible = await ddsTraining.list(instructor);
    const result = visible.standaloneResults.find(
      ({ exercise }) => exercise.id === closed.id,
    );
    if (!result) {
      throw new Error("преподаватель не видит результат карточки из очереди");
    }
    if (result.operatorId !== userIds.onDuty) {
      throw new Error("результат приписан не тому диспетчеру");
    }
    if (result.exercise.result === null) {
      throw new Error("у завершённой карточки нет оценки");
    }
    step(
      `преподаватель видит результат: ${result.exercise.result.score} баллов у ${result.operatorName}`,
    );
  } finally {
    await db
      .delete(ddsExercises)
      .where(eq(ddsExercises.sourceTrainingSessionId, trainingSessionId));
    await db
      .delete(incidentCards)
      .where(eq(incidentCards.trainingSessionId, trainingSessionId));
    await db
      .delete(callEvents)
      .where(eq(callEvents.trainingSessionId, trainingSessionId));
    await db
      .delete(callStates)
      .where(eq(callStates.trainingSessionId, trainingSessionId));
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

main()
  // Контекст Nest держит фоновые таймеры, поэтому выход явный.
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
  });
