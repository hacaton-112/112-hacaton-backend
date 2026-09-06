import { Module } from "@nestjs/common";

import { QwenTtsAdapterModule } from "@/modules/ai-gateway";

import { SpeechSynthesisService } from "./application/speech-synthesis.service";
import { TtsStreamValidator } from "./application/tts-stream.validator";

@Module({
  imports: [QwenTtsAdapterModule],
  providers: [TtsStreamValidator, SpeechSynthesisService],
  exports: [SpeechSynthesisService],
})
export class SpeechSynthesisModule {}
