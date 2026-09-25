import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { TTS_PORT } from "../../ai-gateway.tokens";
import {
  type QwenTtsConfig,
  type QwenTtsEnvironment,
  parseQwenTtsConfig,
} from "./qwen-tts.config";
import { PiperTtsAdapter } from "./piper/piper-tts.adapter";
import {
  assertOfflineEndpoint,
  guardedOfflineFetch,
  offlineSettings,
} from "../../offline-policy";
import {
  QWEN_TTS_CONFIG,
  QWEN_TTS_FETCH,
  type QwenTtsFetch,
} from "./qwen-tts.tokens";

const QWEN_TTS_ENVIRONMENT_KEYS = [
  "TTS_REQUEST_TIMEOUT_MS",
  "PIPER_TTS_BASE_URL",
  "PIPER_TTS_MALE_VOICE",
  "PIPER_TTS_FEMALE_VOICE",
] as const satisfies readonly (keyof QwenTtsEnvironment)[];

const createQwenTtsConfig = (configService: ConfigService) => {
  const parsed = parseQwenTtsConfig(
    Object.fromEntries(
      QWEN_TTS_ENVIRONMENT_KEYS.map((key) => [key, configService.get(key)]),
    ),
  );
  const policy = offlineSettings(configService);
  if (policy.enabled) assertOfflineEndpoint(parsed.baseUrl, policy.hosts);
  return parsed;
};

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
      inject: [ConfigService],
      useFactory: (config: ConfigService): QwenTtsFetch =>
        guardedOfflineFetch(config, globalThis.fetch.bind(globalThis)),
    },
    {
      provide: TTS_PORT,
      inject: [QWEN_TTS_CONFIG, QWEN_TTS_FETCH],
      useFactory: (config: QwenTtsConfig, fetchImplementation: QwenTtsFetch) =>
        new PiperTtsAdapter(config, fetchImplementation),
    },
  ],
  exports: [TTS_PORT],
})
export class QwenTtsAdapterModule {}
