import { Module } from "@nestjs/common";

import { SpeechSynthesisService } from "./application/speech-synthesis.service";
import { TtsStreamValidator } from "./application/tts-stream.validator";

@Module({
  providers: [TtsStreamValidator, SpeechSynthesisService],
  exports: [SpeechSynthesisService],
})
export class SpeechSynthesisModule {}
