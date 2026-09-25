import { eq } from "drizzle-orm";

import { NestFactory } from "@nestjs/core";

import { generateId } from "@/common/utils/id";
import { CoreModule } from "@/core/core.module";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import { scenarios, scenarioVersions } from "@/drizzle/schema";
import { ScenarioEngineService } from "@/modules/scenario-engine";

/**
 * Что движок выдаёт модели на обычные вопросы оператора.
 *
 * Юнит-тесты проверяют правила по одному, а здесь виден весь разговор сразу:
 * на какой вопрос заявитель отвечает фактом, а на какой — только чувством.
 * Ошибки отбора выглядят как ответ не на тот вопрос и в тестах не бросаются в
 * глаза.
 *
 *   docker compose up -d postgres && bun run db:migrate && bun run db:seed
 *   bun run audit:dialogue
 */
const SCENARIO_CODE = "S-015";

const QUESTIONS = [
  "Служба 112, что случилось?",
  "Назовите точный адрес",
  "В квартире кто-то есть?",
  "Вы сейчас в безопасности?",
  "Что видно из окна?",
  "Код домофона какой?",
  "Они дышат?",
  "Повторите адрес, пожалуйста",
] as const;

const column = (value: string, width: number): string =>
  value.length > width ? `${value.slice(0, width - 1)}…` : value.padEnd(width);

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(CoreModule, {
    logger: ["error"],
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
      throw new Error(`Сценарий ${SCENARIO_CODE} не найден — выполните db:seed`);
    }

    await engine.startCall({
      trainingSessionId,
      scenarioVersionId: version.id,
      eventId: generateId(),
    });
    await engine.acceptCall({ trainingSessionId, eventId: generateId() });

    console.log(
      `${column("вопрос оператора", 30)}${column("реакция", 20)}${column("факты", 20)}запасная реплика`,
    );

    for (const question of QUESTIONS) {
      const built = await engine.buildGenerationContext({
        trainingSessionId,
        operatorText: question,
      });
      const facts = built.context.allowedFacts.map((fact) => fact.id);

      console.log(
        column(question, 30) +
          column(built.context.turnPlan?.reactionAct ?? "—", 20) +
          column(facts.join(", ") || "—", 20) +
          `«${built.fallbackReply.text}»`,
      );

      await engine.applyCallerReply({
        trainingSessionId,
        eventId: generateId(),
        operatorText: question,
        reply: built.fallbackReply,
      });
    }
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
