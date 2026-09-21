import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { z } from "zod";

import { LLM_PORT } from "../../ai-gateway.tokens";
import { QUESTION_UNDERSTANDING_PORT } from "../../ports/question-understanding.port";
import { AliceAiStructuredOutputClient } from "./alice-ai-structured-output.client";
import { AliceAiLlmAdapter } from "./alice-ai.adapter";
import { AliceAiQuestionAdapter } from "./alice-ai.question.adapter";
import { type AliceAiEnvironment, parseAliceAiConfig } from "./alice-ai.config";
import {
  LocalLlmAdapter,
  LocalLlmConfigSchema,
} from "../local-llm/local-llm.adapter";
import type { LlmPort } from "../../ports/llm.port";
import type { QuestionUnderstandingPort } from "../../ports/question-understanding.port";
import {
  assertOfflineEndpoint,
  guardedOfflineFetch,
  offlineSettings,
} from "../../offline-policy";

const AI_PROVIDERS = Symbol("AI_PROVIDERS");
interface AiProviders {
  llm: LlmPort;
  questions: QuestionUnderstandingPort;
  structured: Pick<AliceAiStructuredOutputClient, "complete">;
}

export const createAiProviders = (
  config: ConfigService,
  fetchImplementation: typeof fetch,
): AiProviders => {
  const offline = offlineSettings(config);
  const provider = z
    .enum(["alice", "local"])
    .parse(config.get<string>("LLM_PROVIDER") ?? "alice");
  if (offline.enabled && provider !== "local")
    throw new Error(
      "offline-hybrid requires LLM_PROVIDER=local; cloud fallback is prohibited",
    );
  if (provider === "local") {
    if (offline.enabled)
      assertOfflineEndpoint(
        config.get<string>("LLM_BASE_URL") ?? "",
        offline.hosts,
      );
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
        queueSize:
          config.get("LLM_QUEUE_SIZE") ?? (offline.enabled ? 2 : 0),
        queueWaitMs: config.get("LLM_QUEUE_WAIT_MS"),
        literalFactReplies: offline.enabled,
        replyProtocol: config.get("LLM_REPLY_PROTOCOL"),
      }),
      guardedOfflineFetch(config, fetchImplementation),
    );
    return { llm: client, questions: client, structured: client };
  }
  const alice = createAliceAiConfig(config);
  return {
    llm: new AliceAiLlmAdapter(alice, fetchImplementation),
    questions: new AliceAiQuestionAdapter(alice, fetchImplementation),
    structured: new AliceAiStructuredOutputClient(alice, fetchImplementation),
  };
};

const ALICE_AI_ENVIRONMENT_KEYS = [
  "YANDEX_AI_API_KEY",
  "YANDEX_AI_FOLDER_ID",
  "YANDEX_AI_BASE_URL",
  "YANDEX_AI_MODEL",
  "YANDEX_AI_REQUEST_TIMEOUT_MS",
] as const satisfies readonly (keyof AliceAiEnvironment)[];

const createAliceAiConfig = (configService: ConfigService) =>
  parseAliceAiConfig(
    Object.fromEntries(
      ALICE_AI_ENVIRONMENT_KEYS.map((key) => [key, configService.get(key)]),
    ),
  );

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
      provide: AliceAiStructuredOutputClient,
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
    AliceAiStructuredOutputClient,
    QUESTION_UNDERSTANDING_PORT,
  ],
})
export class AliceAiAdapterModule {}
