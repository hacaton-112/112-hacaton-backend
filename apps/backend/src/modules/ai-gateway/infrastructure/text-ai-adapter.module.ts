import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { LLM_PORT } from "../ai-gateway.tokens";
import { QUESTION_UNDERSTANDING_PORT } from "../ports/question-understanding.port";
import {
  LocalLlmAdapter,
  LocalLlmConfigSchema,
} from "./local-llm/local-llm.adapter";
import type { LlmPort } from "../ports/llm.port";
import type { QuestionUnderstandingPort } from "../ports/question-understanding.port";
import {
  STRUCTURED_OUTPUT_PORT,
  type StructuredOutputPort,
} from "../ports/structured-output.port";
import {
  assertOfflineEndpoint,
  guardedOfflineFetch,
  offlineSettings,
} from "../domain/offline-policy";

const AI_PROVIDERS = Symbol("AI_PROVIDERS");
interface AiProviders {
  llm: LlmPort;
  questions: QuestionUnderstandingPort;
  structured: StructuredOutputPort;
}

const createToolsLlm = (
  config: ConfigService,
  fetchImplementation: typeof fetch,
): LocalLlmAdapter | null => {
  const baseUrl = config.get<string>("TOOLS_LLM_BASE_URL");
  if (!baseUrl) return null;
  const offline = offlineSettings(config);
  if (offline.enabled) assertOfflineEndpoint(baseUrl, offline.hosts);
  const timeoutMs = config.get<number>("TOOLS_LLM_TIMEOUT_MS") ?? 120_000;

  return new LocalLlmAdapter(
    LocalLlmConfigSchema.parse({
      baseUrl,
      model: config.get("TOOLS_LLM_MODEL") ?? "tools-model",
      timeoutMs,
      concurrency: config.get("TOOLS_LLM_CONCURRENCY") ?? 1,
      // Фоновые JSON-задачи не делят очередь и CPU со звонком.
      queueSize: 16,
      queueWaitMs: timeoutMs,
      reserveLiveSlot: false,
      literalFactReplies: false,
      replyThinking: false,
    }),
    guardedOfflineFetch(config, fetchImplementation),
  );
};

export const createAiProviders = (
  config: ConfigService,
  fetchImplementation: typeof fetch,
): AiProviders => {
  const offline = offlineSettings(config);
  const tools = createToolsLlm(config, fetchImplementation);
  if (offline.enabled)
    assertOfflineEndpoint(
      config.get<string>("LLM_BASE_URL") ?? "",
      offline.hosts,
    );

  // Единственный провайдер — своя модель: тренажёр работает в закрытом
  // контуре, и облачный запасной путь в нём недоступен по определению.
  const client = new LocalLlmAdapter(
    LocalLlmConfigSchema.parse({
      baseUrl: config.get("LLM_BASE_URL"),
      model: config.get("LLM_MODEL"),
      apiKey: config.get("LLM_API_KEY"),
      timeoutMs: config.get("LLM_TIMEOUT_MS"),
      intentTimeoutMs: config.get("LLM_INTENT_TIMEOUT_MS"),
      replyMaxTokens: config.get("LLM_REPLY_MAX_TOKENS"),
      replyTemperature: config.get("LLM_REPLY_TEMPERATURE"),
      replyThinking: config.get("LLM_REPLY_THINKING"),
      concurrency: config.get("LLM_CONCURRENCY"),
      queueSize: config.get("LLM_QUEUE_SIZE"),
      queueWaitMs: config.get("LLM_QUEUE_WAIT_MS"),
      literalFactReplies: offline.enabled,
      replyProtocol: config.get("LLM_REPLY_PROTOCOL"),
    }),
    guardedOfflineFetch(config, fetchImplementation),
  );

  return { llm: client, questions: client, structured: tools ?? client };
};

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: AI_PROVIDERS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createAiProviders(config, globalThis.fetch.bind(globalThis)),
    },
    {
      provide: STRUCTURED_OUTPUT_PORT,
      inject: [AI_PROVIDERS],
      useFactory: (providers: AiProviders) => providers.structured,
    },
    {
      provide: LLM_PORT,
      inject: [AI_PROVIDERS],
      useFactory: (providers: AiProviders) => providers.llm,
    },
    {
      provide: QUESTION_UNDERSTANDING_PORT,
      inject: [AI_PROVIDERS],
      useFactory: (providers: AiProviders) => providers.questions,
    },
  ],
  exports: [
    LLM_PORT,
    STRUCTURED_OUTPUT_PORT,
    QUESTION_UNDERSTANDING_PORT,
  ],
})
export class TextAiAdapterModule {}
