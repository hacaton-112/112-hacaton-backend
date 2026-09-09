import { Module } from "@nestjs/common";
import WebSocket from "ws";

import { ASR_SOCKET_FACTORY, ASR_STREAMER } from "./asr-stream.port";
import { AsrController } from "./asr.controller";
import { AsrService } from "./asr.service";
import { WhisperAsrStreamer } from "./whisper-asr.streamer";

@Module({
  controllers: [AsrController],
  providers: [
    AsrService,
    WhisperAsrStreamer,
    { provide: ASR_STREAMER, useExisting: WhisperAsrStreamer },
    {
      // Фабрика сокета вынесена в провайдер, чтобы спека проверяла протокол
      // без поднятого сервиса распознавания.
      provide: ASR_SOCKET_FACTORY,
      useValue: (url: string) => new WebSocket(url),
    },
  ],
  exports: [AsrService, ASR_STREAMER],
})
export class AsrModule {}
