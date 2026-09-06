import { Module } from "@nestjs/common";

import { DialogueGenerationModule } from "@/modules/dialogue-generation";
import { SpeechSynthesisModule } from "@/modules/speech-synthesis";

import { VoicePipelineService } from "./application/voice-pipeline.service";

@Module({
  imports: [DialogueGenerationModule, SpeechSynthesisModule],
  providers: [VoicePipelineService],
  exports: [VoicePipelineService],
})
export class VoicePipelineModule {}
