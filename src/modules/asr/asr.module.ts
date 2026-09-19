import { Module } from "@nestjs/common";
import WebSocket from "ws";
import { ConfigModule, ConfigService } from "@nestjs/config";
import {
  assertOfflineEndpoint,
  offlineSettings,
} from "@/modules/ai-gateway/offline-policy";

import { ASR_SOCKET_FACTORY, ASR_STREAMER } from "./asr-stream.port";
import { AsrController } from "./asr.controller";
import { AsrService } from "./asr.service";
import { WhisperAsrStreamer } from "./whisper-asr.streamer";

@Module({
  imports: [ConfigModule],
  controllers: [AsrController],
  providers: [
    AsrService,
    WhisperAsrStreamer,
    { provide: ASR_STREAMER, useExisting: WhisperAsrStreamer },
    {
      // Фабрика сокета вынесена в провайдер, чтобы спека проверяла протокол
      // без поднятого сервиса распознавания.
      provide: ASR_SOCKET_FACTORY,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => (url: string) => {
        const policy = offlineSettings(config);
        if (policy.enabled) assertOfflineEndpoint(url, policy.hosts);
        return new WebSocket(url, { followRedirects: false });
      },
    },
  ],
  exports: [AsrService, ASR_STREAMER],
})
export class AsrModule {}
