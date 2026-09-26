import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { TTS_PORT } from "../../ai-gateway.tokens";
import {
  type TtsConfig,
  type TtsEnvironment,
  parseTtsConfig,
} from "./tts.config";
import { PiperTtsAdapter } from "./piper/piper-tts.adapter";
import {
  assertOfflineEndpoint,
  guardedOfflineFetch,
  offlineSettings,
} from "../../domain/offline-policy";
import {
  TTS_CONFIG,
  TTS_FETCH,
  type TtsFetch,
} from "./tts.tokens";

const QWEN_TTS_ENVIRONMENT_KEYS = [
  "TTS_REQUEST_TIMEOUT_MS",
  "PIPER_TTS_BASE_URL",
  "PIPER_TTS_MALE_VOICE",
  "PIPER_TTS_FEMALE_VOICE",
] as const satisfies readonly (keyof TtsEnvironment)[];

const createTtsConfig = (configService: ConfigService) => {
  const parsed = parseTtsConfig(
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
      provide: TTS_CONFIG,
      inject: [ConfigService],
      useFactory: createTtsConfig,
    },
    {
      provide: TTS_FETCH,
      inject: [ConfigService],
      useFactory: (config: ConfigService): TtsFetch =>
        guardedOfflineFetch(config, globalThis.fetch.bind(globalThis)),
    },
    {
      provide: TTS_PORT,
      inject: [TTS_CONFIG, TTS_FETCH],
      useFactory: (config: TtsConfig, fetchImplementation: TtsFetch) =>
        new PiperTtsAdapter(config, fetchImplementation),
    },
  ],
  exports: [TTS_PORT],
})
export class TtsAdapterModule {}
