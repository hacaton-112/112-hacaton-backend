import { and, desc, eq } from "drizzle-orm";
import { NestFactory } from "@nestjs/core";
import { generateId } from "@/common/utils/id";
import { CoreModule } from "@/core/core.module";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import { scenarios, scenarioVersions } from "@/drizzle/schema";
import { ScenarioEngineService } from "@/modules/scenario-engine";
import { VoicePipelineService } from "@/modules/voice-pipeline/application/voice-pipeline.service";
import type { VoicePipelineRequestFactory } from "@/modules/voice-pipeline/application/voice-pipeline-request.factory";
import { VOICE_PIPELINE_REQUEST_FACTORY } from "@/modules/voice-pipeline/voice-pipeline.tokens";

/**
 * Снимает настоящие запросы к llama-server на одном ходу учебного звонка.
 *
 * Подменяет fetch до старта приложения, поэтому в выводе оказывается ровно то
 * тело, которое backend отправляет модели, а не его реконструкция.
 *
 *   bun test/manual/dump-llm-request.ts --allow-write --operator="ваш адрес"
 *
 * Создаёт синтетический звонок в базе: запускать только на учебном стенде.
 */

interface Captured {
  readonly name: string;
  readonly body: unknown;
}

const captured: Captured[] = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url.includes("/chat/completions") && typeof init?.body === "string") {
    try {
      const body: unknown = JSON.parse(init.body);
      const name =
        (
          body as {
            response_format?: { json_schema?: { name?: string } };
          }
        ).response_format?.json_schema?.name ?? "unknown";
      captured.push({ name, body });
    } catch {
      /* Не наш формат — снимать нечего. */
    }
  }
  return originalFetch(input, init);
}) as typeof fetch;

async function main(): Promise<void> {
  if (!process.argv.includes("--allow-write")) {
    throw new Error(
      "This script persists a synthetic call. Use a training stand and pass --allow-write.",
    );
  }
  const option = (name: string, fallback: string) =>
    process.argv
      .find((argument) => argument.startsWith("--" + name + "="))
      ?.split("=")
      .slice(1)
      .join("=") ?? fallback;
  const scenario = option("scenario", "S-015");
  const operatorText = option("operator", "ваш адрес");
  const warmup = option("warmup", "Что у вас случилось?");

  const app = await NestFactory.createApplicationContext(CoreModule, {
    logger: ["error"],
  });
  const engine = app.get(ScenarioEngineService);
  const factory = app.get<VoicePipelineRequestFactory>(
    VOICE_PIPELINE_REQUEST_FACTORY,
  );
  const pipeline = app.get(VoicePipelineService);
  const db = app.get<DrizzleService["db"]>(DRIZZLE);

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

    // Первый ход только разогревает разговор: интересен второй, где оператор
    // задаёт проверяемый вопрос уже при непустой истории.
    for (const text of [warmup, operatorText]) {
      captured.length = 0;
      const signal = AbortSignal.timeout(120_000);
      const request = await factory.create({
        command: { type: "speak", operatorText: text },
        requestId: generateId(),
        sessionId,
        signal,
      });
      for await (const _event of pipeline.streamReply(request, signal, 0)) {
        // Поток нужно вычерпать, чтобы ход дошёл до конца.
      }
    }

    console.log(
      JSON.stringify(
        { operatorText, requests: captured },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
