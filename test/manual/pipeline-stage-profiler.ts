import { and, desc, eq } from "drizzle-orm";
import { NestFactory } from "@nestjs/core";
import { generateId } from "@/common/utils/id";
import { CoreModule } from "@/core/core.module";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import { scenarios, scenarioVersions } from "@/drizzle/schema";
import {
  QUESTION_UNDERSTANDING_PORT,
  type QuestionUnderstandingPort,
} from "@/modules/ai-gateway";
import { ScenarioEngineService } from "@/modules/scenario-engine";
import { VoicePipelineService } from "@/modules/voice-pipeline/application/voice-pipeline.service";
import type { VoicePipelineRequestFactory } from "@/modules/voice-pipeline/application/voice-pipeline-request.factory";
import { VOICE_PIPELINE_REQUEST_FACTORY } from "@/modules/voice-pipeline/voice-pipeline.tokens";
import type { VoicePipelineMetrics } from "@/contracts";

/**
 * Real text-to-audio route, including prepared audio and recordReply.
 * Creates a persisted synthetic call: run only against an isolated test DB.
 * bun run test/manual/pipeline-stage-profiler.ts --allow-write --scenario=S-015 --turns=6
 * ASR, network delivery to an operator and actual playback are NOT measured.
 */
const SCRIPT = [
  "Служба 112, что у вас случилось?",
  "Назовите точный адрес происшествия.",
  "В квартире есть люди или дети?",
  "Они в сознании, дышат?",
  "Где вы сами находитесь? Вы в безопасности?",
  "Пожарные уже выехали, оставайтесь на связи.",
] as const;

async function main(): Promise<void> {
  if (!process.argv.includes("--allow-write")) {
    throw new Error(
      "This profiler persists a synthetic call. Use an isolated DB and pass --allow-write.",
    );
  }
  const option = (name: string, fallback: string) =>
    process.argv
      .find((arg) => arg.startsWith("--" + name + "="))
      ?.split("=")[1] ?? fallback;
  const scenario = option("scenario", "S-015");
  const turns = Number(option("turns", "6"));
  if (!Number.isInteger(turns) || turns < 1 || turns > SCRIPT.length) {
    throw new Error("turns must be between 1 and " + SCRIPT.length);
  }
  const app = await NestFactory.createApplicationContext(CoreModule, {
    // Rejection reasons are part of latency diagnosis: a hidden retry can
    // otherwise look like unexplained model slowness.
    logger: ["error", "warn"],
  });
  const engine = app.get(ScenarioEngineService);
  const factory = app.get<VoicePipelineRequestFactory>(
    VOICE_PIPELINE_REQUEST_FACTORY,
  );
  const pipeline = app.get(VoicePipelineService);
  const questions = app.get<QuestionUnderstandingPort>(
    QUESTION_UNDERSTANDING_PORT,
  );
  const db = app.get<DrizzleService["db"]>(DRIZZLE);
  const originalUnderstand = questions.understand;
  let intentCalls = 0;
  let intentMs = 0;
  // Instrument the actual port, including failures and queue waiting. No guessed split.
  questions.understand = async (...args) => {
    const started = performance.now();
    intentCalls++;
    try {
      return await originalUnderstand.apply(questions, args);
    } finally {
      intentMs += performance.now() - started;
    }
  };
  const rows: Record<string, unknown>[] = [];
  try {
    const [version] = await db
      .select({ id: scenarioVersions.id })
      .from(scenarioVersions)
      .innerJoin(scenarios, eq(scenarioVersions.scenarioId, scenarios.id))
      .where(
        and(eq(scenarios.code, scenario), eq(scenarios.status, "published")),
      )
      .orderBy(desc(scenarioVersions.version))
      .limit(1);
    if (!version) throw new Error("Published scenario not found: " + scenario);
    await pipeline.assertCanStart(version.id);
    const sessionId = generateId();
    await engine.startCall({
      trainingSessionId: sessionId,
      scenarioVersionId: version.id,
      eventId: generateId(),
    });
    await engine.acceptCall({
      trainingSessionId: sessionId,
      eventId: generateId(),
    });
    for (const [index, operatorText] of SCRIPT.slice(0, turns).entries()) {
      intentCalls = 0;
      intentMs = 0;
      const started = performance.now();
      const requestId = generateId();
      const signal = AbortSignal.timeout(60_000);
      const request = await factory.create({
        command: { type: "speak", operatorText },
        requestId,
        sessionId,
        signal,
      });
      const factoryMs = performance.now() - started;
      let firstAudioMs: number | null = null;
      let recordMs = 0;
      let replyText = "";
      let metrics: VoicePipelineMetrics | undefined;
      for await (const event of pipeline.streamReply(
        request,
        signal,
        factoryMs,
      )) {
        if (event.type === "voice.reply.ready") {
          replyText = event.result.reply.text;
          const recordStarted = performance.now();
          await factory.recordReply({
            requestId,
            sessionId,
            operatorText,
            reply: event.result.reply,
            generation: {
              source: event.result.source,
              attempts: event.result.attempts,
            },
          });
          recordMs += performance.now() - recordStarted;
        } else if (event.type === "voice.audio.chunk") {
          firstAudioMs ??= performance.now() - started;
        } else if (event.type === "voice.completed") {
          metrics = event.metrics;
        }
      }
      if (!metrics) throw new Error("Pipeline ended without completion");
      const row = {
        turn: index + 1,
        question: operatorText,
        replyText,
        factoryMs,
        intentCalls,
        intentMs,
        recordMs,
        firstAudioMs,
        totalMs: performance.now() - started,
        // Attempt durations and TTFT include provider/queue overhead, NOT pure decode.
        generationAttempts: metrics.generation.attempts,
        source: metrics.generation.source,
        resolution: metrics.generation.resolution,
        synthesis: metrics.synthesis,
      };
      rows.push(row);
      console.log(JSON.stringify(row));
    }
    console.log(
      JSON.stringify({
        scenario,
        sessionId,
        turns: rows.length,
        preparedSourceTurns: rows.filter((row) => row.source === "prepared")
          .length,
        intentCalls: rows.reduce(
          (sum, row) => sum + Number(row.intentCalls),
          0,
        ),
        note: "Port calls are not server tokens/s. Use llama-server timings for prompt/decode/queue detail; ASR is excluded.",
      }),
    );
  } finally {
    questions.understand = originalUnderstand;
    await app.close();
  }
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
