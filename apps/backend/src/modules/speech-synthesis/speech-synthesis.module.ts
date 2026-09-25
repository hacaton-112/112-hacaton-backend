import { Module } from "@nestjs/common";

import { TtsAdapterModule } from "@/modules/ai-gateway";

import { SpeechSynthesisService } from "./application/speech-synthesis.service";
import { TtsStreamValidator } from "./application/tts-stream.validator";

@Module({
  imports: [TtsAdapterModule],
  providers: [TtsStreamValidator, SpeechSynthesisService],
  exports: [SpeechSynthesisService],
})
export class SpeechSynthesisModule {}
