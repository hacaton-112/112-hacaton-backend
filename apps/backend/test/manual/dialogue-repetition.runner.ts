import { and, desc, eq, inArray } from "drizzle-orm";

import { NestFactory } from "@nestjs/core";

import { generateId } from "@/common/utils/id";
import { CoreModule } from "@/core/core.module";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import { callEvents, scenarios, scenarioVersions } from "@/drizzle/schema";
import { DialogueGenerationService } from "@/modules/dialogue-generation";
import { ScenarioEngineService } from "@/modules/scenario-engine";
import type { VoicePipelineRequestFactory } from "@/modules/voice-pipeline/application/voice-pipeline-request.factory";
import { VOICE_PIPELINE_REQUEST_FACTORY } from "@/modules/voice-pipeline/voice-pipeline.tokens";

/**
 * Насколько заявитель повторяется в разговоре с настоящей моделью.
 *
 * Юнит-тесты проверяют каждое правило по отдельности, а повтор — свойство
 * всего разговора: одна и та же фраза в конце каждой реплики не видна ни в
 * одном ходу по отдельности. Прогон ведёт звонок тем же путём, что и голосовой
 * канал, только без звука: разбор вопроса, контекст движка, генерация и запись
 * хода.
 *
 *   bun run audit:repetition
 *   bun run audit:repetition -- --scenarios=S-015,S-034
 *
 * Прогон ходит в настоящую модель и пишет звонки в базу разработки.
 */

const OPERATOR_SCRIPT = [
  "Служба 112, что случилось?",
  "Назовите точный адрес.",
  "Какой номер дома?",
  "Этаж и квартира?",
  "Кто-нибудь пострадал?",
  "Они в сознании, дышат?",
  "Где вы сами сейчас находитесь?",
  "Помощь уже выехала, оставайтесь на линии.",
  "Код домофона знаете?",
  "Что вы сейчас видите?",
  "Я вас слышу. Как вас зовут?",
  "Назовите номер телефона для связи.",
  "Бригада выехала, ждите на улице.",
  "Хорошо, оставайтесь на связи.",
] as const;

const DEFAULT_SCENARIOS = ["S-015", "S-034"];

/** Слова короче трёх букв о содержании фразы ничего не говорят. */
const contentWords = (sentence: string): string[] =>
  sentence
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .filter((word) => word.length >= 3);

const sentencesOf = (text: string): string[] =>
  text
    .split(/(?<=[.!?…])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => contentWords(sentence).length > 0);

/**
 * Фраза повторяет прежнюю, если большая часть её слов уже звучала в одной
 * фразе одной из трёх последних реплик. Метрика намеренно своя, а не та, что
 * в защите от повторов: мерить защиту её же правилом бессмысленно.
 */
const repeatsEarlier = (sentence: string, earlier: string[]): boolean => {
  const words = new Set(contentWords(sentence));

  return earlier.some((previous) => {
    const previousWords = new Set(contentWords(previous));
    const shared = [...words].filter((word) => previousWords.has(word)).length;
    const smaller = Math.min(words.size, previousWords.size);

    return smaller > 0 && shared / smaller >= 0.75;
  });
};

interface Turn {
  operator: string;
  caller: string;
  source: string;
  repeated: string[];
}

const argument = (name: string): string | undefined =>
  process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.slice(name.length + 3);

async function main(): Promise<void> {
  const codes = argument("scenarios")?.split(",") ?? DEFAULT_SCENARIOS;
  const app = await NestFactory.createApplicationContext(CoreModule, {
    logger: ["error"],
  });
  const engine = app.get(ScenarioEngineService);
  const factory = app.get<VoicePipelineRequestFactory>(
    VOICE_PIPELINE_REQUEST_FACTORY,
  );
  const generation = app.get(DialogueGenerationService);
  const db = app.get<DrizzleService["db"]>(DRIZZLE);
  const summary: string[] = [];

  try {
    for (const code of codes) {
      const [version] = await db
        .select({ id: scenarioVersions.id })
        .from(scenarioVersions)
        .innerJoin(scenarios, eq(scenarioVersions.scenarioId, scenarios.id))
        .where(and(eq(scenarios.code, code), eq(scenarios.status, "published")))
        .orderBy(desc(scenarioVersions.version))
        .limit(1);

      if (!version) {
        throw new Error(`Сценарий ${code} не опубликован — выполните db:seed`);
      }

      const sessionId = generateId();
      await engine.startCall({
        trainingSessionId: sessionId,
        scenarioVersionId: version.id,
        eventId: generateId(),
      });
      const accepted = await engine.acceptCall({
        trainingSessionId: sessionId,
        eventId: generateId(),
      });

      const callerHistory: string[] = [accepted.openingLine];
      const turns: Turn[] = [];

      for (const operatorText of OPERATOR_SCRIPT) {
        const requestId = generateId();
        const signal = new AbortController().signal;
        const request = await factory.create({
          command: { type: "speak", operatorText },
          requestId,
          sessionId,
          signal,
        });
        const result = await generation.generate(request.generation, signal);

        await factory.recordReply({
          requestId,
          sessionId,
          operatorText,
          reply: result.reply,
          generation: { source: result.source, attempts: result.attempts },
        });

        const earlier = callerHistory.slice(-3).flatMap(sentencesOf);
        turns.push({
          operator: operatorText,
          caller: result.reply.text,
          source: result.source,
          repeated: sentencesOf(result.reply.text).filter((sentence) =>
            repeatsEarlier(sentence, earlier),
          ),
        });
        callerHistory.push(result.reply.text);
      }

      const rejected = await db
        .select({ payload: callEvents.payload })
        .from(callEvents)
        .where(
          and(
            eq(callEvents.trainingSessionId, sessionId),
            inArray(callEvents.type, ["fact.rejected"]),
          ),
        );

      console.log(`\n=== ${code} — «${accepted.openingLine}»`);
      for (const turn of turns) {
        console.log(`  ОП: ${turn.operator}`);
        console.log(
          `  ЗАЯВ[${turn.source}]: ${turn.caller}${turn.repeated.length > 0 ? `   ⟲ ${turn.repeated.join(" | ")}` : ""}`,
        );
      }

      const withRepeats = turns.filter((turn) => turn.repeated.length > 0);
      const frequency = new Map<string, number>();
      for (const turn of turns) {
        for (const sentence of sentencesOf(turn.caller)) {
          const key = contentWords(sentence).join(" ");
          frequency.set(key, (frequency.get(key) ?? 0) + 1);
        }
      }
      const top = [...frequency.entries()]
        .filter(([, count]) => count > 1)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([sentence, count]) => `«${sentence}» ×${count}`);

      summary.push(
        `${code}: реплик с повтором ${withRepeats.length}/${turns.length}, ` +
          `отклонённых фактов ${rejected.length}, ` +
          `запасных реплик ${turns.filter((turn) => turn.source !== "model").length}` +
          (top.length > 0 ? `; чаще всего: ${top.join(", ")}` : ""),
      );

      await engine.endCall({
        trainingSessionId: sessionId,
        eventId: generateId(),
        reason: "audit",
      });
    }

    console.log(`\n${summary.join("\n")}`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
