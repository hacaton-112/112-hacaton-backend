import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { LLM_PORT } from "../../ai-gateway.tokens";
import { QUESTION_UNDERSTANDING_PORT } from "../../ports/question-understanding.port";
import { AliceAiLlmAdapter } from "./alice-ai.adapter";
import { AliceAiQuestionAdapter } from "./alice-ai.question.adapter";
import { type AliceAiEnvironment, parseAliceAiConfig } from "./alice-ai.config";
import {
  ALICE_AI_CONFIG,
  ALICE_AI_FETCH,
  type AliceAiFetch,
} from "./alice-ai.tokens";

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
      provide: ALICE_AI_CONFIG,
      inject: [ConfigService],
      useFactory: createAliceAiConfig,
    },
    {
      provide: ALICE_AI_FETCH,
      useFactory: (): AliceAiFetch => globalThis.fetch.bind(globalThis),
    },
    AliceAiLlmAdapter,
    {
      provide: LLM_PORT,
      useExisting: AliceAiLlmAdapter,
    },
    AliceAiQuestionAdapter,
    {
      provide: QUESTION_UNDERSTANDING_PORT,
      useExisting: AliceAiQuestionAdapter,
    },
  ],
  exports: [LLM_PORT, QUESTION_UNDERSTANDING_PORT],
})
export class AliceAiAdapterModule {}
