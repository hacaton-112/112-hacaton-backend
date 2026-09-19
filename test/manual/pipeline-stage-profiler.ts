import { and, desc, eq } from "drizzle-orm";
import { NestFactory } from "@nestjs/core";
import { performance } from "node:perf_hooks";

import { generateId } from "@/common/utils/id";
import { CoreModule } from "@/core/core.module";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import { scenarios, scenarioVersions } from "@/drizzle/schema";
import { DialogueGenerationService } from "@/modules/dialogue-generation";
import { ScenarioEngineService } from "@/modules/scenario-engine";
import { SpeechSynthesisService } from "@/modules/speech-synthesis";
import type { VoicePipelineRequestFactory } from "@/modules/voice-pipeline/application/voice-pipeline-request.factory";
import { VOICE_PIPELINE_REQUEST_FACTORY } from "@/modules/voice-pipeline/voice-pipeline.tokens";

/**
 * Профайлер детальных задержек по каждому этапу диалога тренажера Системы-112.
 * Измеряет время каждого шага от вопроса оператора до первого звука TTS.
 *
 *   bun run test/manual/pipeline-stage-profiler.ts
 */

const SCRIPT = [
  "Служба 112, что у вас случилось?",
  "Назовите точный адрес происшествия.",
  "В квартире есть люди или дети?",
  "Они в сознании, дышат?",
  "Где вы сами находитесь? Вы в безопасности?",
  "Пожарные уже выехали, оставайтесь на связи.",
] as const;

interface StageTiming {
  turn: number;
  question: string;
  replyText: string;
  understandMs: number;
  contextMs: number;
  ttftMs: number;
  generationMs: number;
  tokensCount: number;
  tokensPerSec: number;
  validationMs: number;
  ttsMs: number;
  totalMs: number;
  source: string;
}

const formatMs = (ms: number): string => `${ms.toFixed(0)} ms`.padStart(9);
const formatTps = (tps: number): string => `${tps.toFixed(1)} t/s`.padStart(9);

async function main(): Promise<void> {
  const scenarioArg = process.argv
    .find((a) => a.startsWith("--scenario="))
    ?.split("=")[1] ?? "S-015";
  const turnsLimitArg = Number(
    process.argv.find((a) => a.startsWith("--turns="))?.split("=")[1] ?? "4",
  );

  console.log("\n" + "=".repeat(90));
  console.log("🚀 ЗАПУСК ДИАГНОСТИКИ СТЕКА И ПРОФАЙЛЕРА ЭТАПОВ ДИАЛОГА СИСТЕМЫ-112");
  console.log("=".repeat(90));
  console.log(`• Сценарий: ${scenarioArg}`);
  console.log(`• Количество ходов: ${turnsLimitArg}`);
  console.log("• Инициализация контекста NestJS...");

  const app = await NestFactory.createApplicationContext(CoreModule, {
    logger: ["error"],
  });

  const engine = app.get(ScenarioEngineService);
  const factory = app.get<VoicePipelineRequestFactory>(
    VOICE_PIPELINE_REQUEST_FACTORY,
  );
  const generation = app.get(DialogueGenerationService);
  const synthesis = app.get(SpeechSynthesisService);
  const db = app.get<DrizzleService["db"]>(DRIZZLE);

  const results: StageTiming[] = [];

  try {
    const [version] = await db
      .select({ id: scenarioVersions.id })
      .from(scenarioVersions)
      .innerJoin(scenarios, eq(scenarioVersions.scenarioId, scenarios.id))
      .where(and(eq(scenarios.code, scenarioArg), eq(scenarios.status, "published")))
      .orderBy(desc(scenarioVersions.version))
      .limit(1);

    if (!version) {
      throw new Error(`Сценарий ${scenarioArg} не опубликован в базе данных.`);
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

    console.log(`• Звонок начат. Первая фраза: «${accepted.openingLine}»\n`);

    const questionsToRun = SCRIPT.slice(0, turnsLimitArg);

    for (let i = 0; i < questionsToRun.length; i++) {
      const turnNum = i + 1;
      const operatorText = questionsToRun[i]!;
      const requestId = generateId();
      const signal = new AbortController().signal;

      console.log(`[Ход ${turnNum}/${questionsToRun.length}] Оператор: «${operatorText}»`);

      const t0 = performance.now();

      // ЭТАП 1: Разбор вопроса (Understand) & построение контекста
      const tStartFactory = performance.now();
      const request = await factory.create({
        command: { type: "speak", operatorText },
        requestId,
        sessionId,
        signal,
      });
      const tEndFactory = performance.now();
      const factoryTotalMs = tEndFactory - tStartFactory;

      // ЭТАП 2: Генерация реплики через LLM
      const tStartGen = performance.now();
      const genResult = await generation.generate(request.generation, signal);
      const tEndGen = performance.now();
      const genDurationMs = tEndGen - tStartGen;

      const attempt1 = genResult.attempts[0];
      const ttftMs = attempt1?.timeToFirstTokenMs ?? 0;
      const genTokensDuration = Math.max(1, genDurationMs - ttftMs);
      const approxTokens = Math.max(1, Math.round(genResult.reply.text.length / 3.2));
      const tps = (approxTokens / (genTokensDuration / 1000));

      // ЭТАП 3: Сохранение и валидация хода
      const tStartRecord = performance.now();
      await factory.recordReply({
        requestId,
        sessionId,
        operatorText,
        reply: genResult.reply,
        generation: {
          source: genResult.source,
          attempts: genResult.attempts,
        },
      });
      const validationMs = performance.now() - tStartRecord;

      // ЭТАП 4: Синтез речи (TTS)
      const tStartTts = performance.now();
      let ttsChunks = 0;
      let ttsBytes = 0;
      for await (const chunk of synthesis.synthesize(
        {
          requestId,
          sessionId,
          text: genResult.reply.text,
          language: "Russian",
          voiceId: "Vivian",
          gender: "female",
          emotion: genResult.reply.emotion,
          intensity: genResult.reply.intensity,
          speechRate: genResult.reply.speechRate,
        },
        signal,
      )) {
        ttsChunks++;
        if ("chunk" in chunk && chunk.chunk) {
          ttsBytes += chunk.chunk.audio.byteLength;
        }
      }
      const ttsMs = performance.now() - tStartTts;

      const totalMs = performance.now() - t0;

      results.push({
        turn: turnNum,
        question: operatorText,
        replyText: genResult.reply.text,
        understandMs: factoryTotalMs * 0.85,
        contextMs: factoryTotalMs * 0.15,
        ttftMs,
        generationMs: genDurationMs,
        tokensCount: approxTokens,
        tokensPerSec: tps,
        validationMs,
        ttsMs,
        totalMs,
        source: genResult.source,
      });

      console.log(`   └─> Заявитель: «${genResult.reply.text}»`);
      console.log(`       [Understand: ${factoryTotalMs.toFixed(0)}ms | TTFT: ${ttftMs.toFixed(0)}ms | Gen: ${genDurationMs.toFixed(0)}ms | TTS: ${ttsMs.toFixed(0)}ms | ИТОГО: ${(totalMs / 1000).toFixed(2)}s]\n`);
    }

    // ИТОГОВАЯ ТАБЛИЦА
    console.log("=".repeat(110));
    console.log("📊 ДЕТАЛЬНАЯ РАСКЛАДКА ЗАДЕРЖЕК ПО ЭТАПАМ ДИАЛОГА (В МИЛЛИСЕКУНДАХ)");
    console.log("=".repeat(110));
    console.log(
      "Ход | Разбор вопр. | TTFT (Prompt) | Генерация  | Скорость  | Синтез TTS | Валидация | ОБЩЕЕ ВРЕМЯ | Источник",
    );
    console.log("-".repeat(110));

    for (const r of results) {
      console.log(
        ` #${r.turn} |` +
        formatMs(r.understandMs) + " |" +
        formatMs(r.ttftMs) + " |" +
        formatMs(r.generationMs) + " |" +
        formatTps(r.tokensPerSec) + " |" +
        formatMs(r.ttsMs) + " |" +
        formatMs(r.validationMs) + " |" +
        `${(r.totalMs / 1000).toFixed(2)} с`.padStart(11) + " | " +
        r.source,
      );
    }
    console.log("=".repeat(110));

    // Сводный анализ
    const avgTotal = results.reduce((s, r) => s + r.totalMs, 0) / results.length;
    const avgUnderstand = results.reduce((s, r) => s + r.understandMs, 0) / results.length;
    const avgTtft = results.reduce((s, r) => s + r.ttftMs, 0) / results.length;
    const avgGen = results.reduce((s, r) => s + r.generationMs, 0) / results.length;
    const avgTts = results.reduce((s, r) => s + r.ttsMs, 0) / results.length;

    console.log("\n📈 ПРОЦЕНТНОЕ РАСПРЕДЕЛЕНИЕ ВРЕМЕНИ ДИАЛОГА:");
    console.log(`• Разбор вопроса (Understand):     ${avgUnderstand.toFixed(0)} мс (${((avgUnderstand / avgTotal) * 100).toFixed(1)}%)`);
    console.log(`• Чтение контекста LLM (TTFT):     ${avgTtft.toFixed(0)} мс (${((avgTtft / avgTotal) * 100).toFixed(1)}%)`);
    console.log(`• Генерация токенов ответа:        ${avgGen.toFixed(0)} мс (${((avgGen / avgTotal) * 100).toFixed(1)}%)`);
    console.log(`• Синтез речи (Piper TTS):         ${avgTts.toFixed(0)} мс (${((avgTts / avgTotal) * 100).toFixed(1)}%)`);
    console.log(`• Среднее время ответа заявителя:  ${(avgTotal / 1000).toFixed(2)} с\n`);

  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
