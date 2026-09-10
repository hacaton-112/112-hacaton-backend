import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { TTS_PORT } from "../../ai-gateway.tokens";
import { type QwenTtsEnvironment, parseQwenTtsConfig } from "./qwen-tts.config";
import { createQwenTtsAdapter } from "./qwen-tts.factory";
import {
  QWEN_TTS_CONFIG,
  QWEN_TTS_FETCH,
  type QwenTtsFetch,
} from "./qwen-tts.tokens";

const QWEN_TTS_ENVIRONMENT_KEYS = [
  "QWEN_TTS_PROVIDER",
  "QWEN_TTS_MODE",
  "QWEN_TTS_BASE_URL",
  "QWEN_TTS_MODEL",
  "QWEN_TTS_REFERENCE_VOICES_PATH",
  "QWEN_TTS_STREAMING_INTERVAL_SECONDS",
  "QWEN_TTS_REQUEST_TIMEOUT_MS",
] as const satisfies readonly (keyof QwenTtsEnvironment)[];

const createQwenTtsConfig = (configService: ConfigService) =>
  parseQwenTtsConfig(
    Object.fromEntries(
      QWEN_TTS_ENVIRONMENT_KEYS.map((key) => [key, configService.get(key)]),
    ),
  );

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: QWEN_TTS_CONFIG,
      inject: [ConfigService],
      useFactory: createQwenTtsConfig,
    },
    {
      provide: QWEN_TTS_FETCH,
      useFactory: (): QwenTtsFetch => globalThis.fetch.bind(globalThis),
    },
    {
      provide: TTS_PORT,
      inject: [QWEN_TTS_CONFIG, QWEN_TTS_FETCH],
      useFactory: createQwenTtsAdapter,
    },
  ],
  exports: [TTS_PORT],
})
export class QwenTtsAdapterModule {}
