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

    if (!accepted.revealedFactKeys.includes("incident_type")) {
      throw new Error("первая реплика сказала, что горит, но факт не засчитан");
    }
    if (accepted.revealedFactKeys.includes("address_floor")) {
      throw new Error("первая реплика открыла факт, который сценарий держит");
    }
    step(
      `первой репликой засчитано: ${accepted.revealedFactKeys.join(", ")}`,
    );

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

    // Лишний идентификатор снимается, а слова доходят до синтеза: модель
    // скрытых фактов не получает и раскрыть их не может.
    const withStrayLabel = await engine.applyCallerReply({
      trainingSessionId,
      eventId: generateId(),
      operatorText: "Назовите точный адрес",
      reply: {
        text: "Я не знаю, я во дворе стою!",
        emotion: "panic",
        intensity: 0.8,
        speechRate: 1.2,
        revealedFactIds: ["door_code"],
        endCall: false,
      },
    });

    if (withStrayLabel.revealedFactKeys.includes("door_code")) {
      throw new Error("факт вне разрешённого набора попал в состояние звонка");
    }
    step("лишняя пометка факта снята, реплика сохранена");

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

    const beforeChildren = await engine.getSnapshot(trainingSessionId);
    const withChildren = await engine.applyCallerReply({
      trainingSessionId,
      eventId: generateId(),
      operatorText: "В квартире кто-то есть?",
      reply: {
        text: "Там дети, двое, они кричат из окна!",
        emotion: "panic",
        intensity: 0.9,
        speechRate: 1.3,
        // Модель не назвала факт — засчитать его должны сами слова.
        revealedFactIds: [],
        endCall: false,
      },
    });

    if (!withChildren.revealedFactKeys.includes("trapped_children")) {
      throw new Error("заявитель сказал про детей, но факт не засчитан");
    }
    step(
      `факт trapped_children засчитан по словам, чек-лист ${beforeChildren.checklistSatisfied} → ${withChildren.checklistSatisfied}`,
    );

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
