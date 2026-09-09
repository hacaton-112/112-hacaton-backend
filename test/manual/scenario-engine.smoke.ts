import { eq } from "drizzle-orm";

import { NestFactory } from "@nestjs/core";

import { generateId } from "@/common/utils/id";
import { CoreModule } from "@/core/core.module";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  callEvents,
  callStates,
  scenarios,
  scenarioVersions,
} from "@/drizzle/schema";
import { ScenarioEngineService } from "@/modules/scenario-engine";

/**
 * Ручная проверка движка на реальной базе.
 *
 * Юнит-тесты работают на стабе хранилища, поэтому SQL, транзакции и
 * идемпотентность журнала проверяются только здесь.
 *
 *   docker compose up -d postgres && bun run db:migrate && bun run db:seed
 *   bun run smoke:scenario-engine
 */
const SCENARIO_CODE = "S-015";

const step = (message: string): void => {
  console.log(`• ${message}`);
};

const expectFailure = async (
  description: string,
  action: () => Promise<unknown>,
): Promise<void> => {
  try {
    await action();
  } catch (error) {
    step(`${description}: отклонено (${(error as Error).message})`);

    return;
  }

  throw new Error(`${description}: ожидался отказ, но команда прошла`);
};

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(CoreModule, {
    logger: ["error", "warn"],
  });

  const engine = app.get(ScenarioEngineService);
  const db = app.get<DrizzleService["db"]>(DRIZZLE);
  const trainingSessionId = generateId();

  try {
    const [version] = await db
      .select({ id: scenarioVersions.id })
      .from(scenarioVersions)
      .innerJoin(scenarios, eq(scenarioVersions.scenarioId, scenarios.id))
      .where(eq(scenarios.code, SCENARIO_CODE))
      .limit(1);

    if (!version) {
      throw new Error(
        `Сценарий ${SCENARIO_CODE} не найден — выполните db:seed`,
      );
    }

    const offered = await engine.startCall({
      trainingSessionId,
      scenarioVersionId: version.id,
      eventId: generateId(),
    });
    step(
      `вызов предложен: ступень ${offered.panicLevel}, круг ${offered.locator?.radiusMeters} м`,
    );

    if (JSON.stringify(offered).includes("Учебная")) {
      throw new Error("локатор раскрыл точный адрес");
    }
    step("точный адрес в локаторе отсутствует");

    const accepted = await engine.acceptCall({
      trainingSessionId,
      eventId: generateId(),
    });
    step(`вызов принят, первая реплика: «${accepted.openingLine}»`);

    const opening = await engine.buildGenerationContext({
      trainingSessionId,
      operatorText: "Служба 112, что случилось?",
    });
    const openingKeys = opening.context.allowedFacts.map((fact) => fact.id);
    step(`разрешено на первом ходу: ${openingKeys.join(", ")}`);

    if (openingKeys.includes("address_street")) {
      throw new Error("адрес открылся без вопроса оператора");
    }

    await engine.applyCallerReply({
      trainingSessionId,
      eventId: generateId(),
      operatorText: "Служба 112, что случилось?",
      reply: {
        text: "Горит квартира, пятый этаж!",
        emotion: "panic",
        intensity: 0.8,
        speechRate: 1.2,
        revealedFactIds: ["incident_type"],
        endCall: false,
      },
    });
    step("факт incident_type раскрыт");

    const asked = await engine.buildGenerationContext({
      trainingSessionId,
      operatorText: "Назовите точный адрес",
    });
    const askedKeys = asked.context.allowedFacts.map((fact) => fact.id);

    if (!askedKeys.includes("address_street")) {
      throw new Error("адрес не открылся после вопроса");
    }
    step("после вопроса про адрес факт стал доступен");

    await expectFailure("раскрытие факта вне разрешённого набора", () =>
      engine.applyCallerReply({
        trainingSessionId,
        eventId: generateId(),
        operatorText: "Назовите точный адрес",
        reply: {
          text: "Код домофона 1К45!",
          emotion: "panic",
          intensity: 0.8,
          speechRate: 1.2,
          revealedFactIds: ["door_code"],
          endCall: false,
        },
      }),
    );

    const replayEventId = generateId();
    const first = await engine.applyCallerReply({
      trainingSessionId,
      eventId: replayEventId,
      operatorText: "Назовите точный адрес",
      reply: {
        text: "Улица Учебная!",
        emotion: "panic",
        intensity: 0.8,
        speechRate: 1.2,
        revealedFactIds: ["address_street"],
        endCall: false,
      },
    });
    await engine.applyCallerReply({
      trainingSessionId,
      eventId: replayEventId,
      operatorText: "Назовите точный адрес",
      reply: {
        text: "Улица Учебная!",
        emotion: "panic",
        intensity: 0.8,
        speechRate: 1.2,
        revealedFactIds: ["address_street"],
        endCall: false,
      },
    });

    const afterReplay = await engine.getSnapshot(trainingSessionId);

    if (afterReplay.revealedFactKeys.length !== first.revealedFactKeys.length) {
      throw new Error("повторная доставка команды сдвинула состояние");
    }
    step("повтор команды с тем же eventId состояние не изменил");

    const future = new Date(Date.now() + 30_000);
    await engine.tick({ trainingSessionId, now: future });
    const afterSilence = await engine.getSnapshot(trainingSessionId);
    step(
      `после 30 с молчания ступень: ${afterSilence.panicLevel} (была ${first.panicLevel})`,
    );

    const ended = await engine.endCall({
      trainingSessionId,
      eventId: generateId(),
      reason: "operator",
    });
    step(
      `вызов завершён: чек-лист ${ended.checklistSatisfied} из ${ended.checklistTotal}`,
    );

    const journal = await db
      .select({ type: callEvents.type })
      .from(callEvents)
      .where(eq(callEvents.trainingSessionId, trainingSessionId));
    step(`в журнале ${journal.length} событий`);

    console.log("\nдвижок сценария работает на живой базе");
  } finally {
    await db
      .delete(callEvents)
      .where(eq(callEvents.trainingSessionId, trainingSessionId));
    await db
      .delete(callStates)
      .where(eq(callStates.trainingSessionId, trainingSessionId));
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
