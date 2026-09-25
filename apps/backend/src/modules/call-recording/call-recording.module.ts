import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import {
  assertOfflineEndpoint,
  guardedOfflineFetch,
  offlineSettings,
} from "@/modules/ai-gateway/domain/offline-policy";

import {
  CallRecordingService,
  NoopCallRecordingService,
} from "./application/call-recording.service";
import { CALL_RECORDER, CALL_RECORDING_CONFIG } from "./call-recording.tokens";
import {
  parseCallRecordingConfig,
  type CallRecordingConfig,
  type CallRecordingEnvironment,
} from "./infrastructure/call-recording.config";
import { S3RecordingStorage } from "./infrastructure/s3-recording.storage";
import {
  RECORDING_STORAGE,
  type RecordingStorage,
} from "./ports/recording-storage.port";

const CALL_RECORDING_ENVIRONMENT_KEYS = [
  "CALL_RECORDING_ENABLED",
  "CALL_RECORDING_S3_ENDPOINT",
  "CALL_RECORDING_S3_REGION",
  "CALL_RECORDING_S3_BUCKET",
  "CALL_RECORDING_S3_ACCESS_KEY_ID",
  "CALL_RECORDING_S3_SECRET_ACCESS_KEY",
] as const satisfies readonly (keyof CallRecordingEnvironment)[];

const createCallRecordingConfig = (configService: ConfigService) =>
  parseCallRecordingConfig(
    Object.fromEntries(
      CALL_RECORDING_ENVIRONMENT_KEYS.map((key) => [
        key,
        configService.get(key),
      ]),
    ),
  );

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: CALL_RECORDING_CONFIG,
      inject: [ConfigService],
      useFactory: createCallRecordingConfig,
    },
    {
      provide: RECORDING_STORAGE,
      inject: [CALL_RECORDING_CONFIG, ConfigService],
      useFactory: (config: CallRecordingConfig, environment: ConfigService) => {
        const policy = offlineSettings(environment);
        if (policy.enabled)
          assertOfflineEndpoint(config.endpoint, policy.hosts);
        return new S3RecordingStorage(
          config,
          guardedOfflineFetch(environment, globalThis.fetch.bind(globalThis)),
        );
      },
    },
    {
      // Без хранилища звонок должен идти как обычно, поэтому выключенная
      // запись — это не ветка в гейтвее, а другая реализация того же порта.
      provide: CALL_RECORDER,
      inject: [CALL_RECORDING_CONFIG, RECORDING_STORAGE],
      useFactory: (config: CallRecordingConfig, storage: RecordingStorage) =>
        config.enabled
          ? new CallRecordingService(storage)
          : new NoopCallRecordingService(),
    },
  ],
  exports: [CALL_RECORDER, RECORDING_STORAGE],
})
export class CallRecordingModule {}
