import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "@/modules/auth/auth.module";
import { CallRecordingModule } from "@/modules/call-recording";
import { ScenarioEngineModule } from "@/modules/scenario-engine";
import { SpeechSynthesisModule } from "@/modules/speech-synthesis";
import { ScenarioAudioService } from "./application/scenario-audio.service";
import { ScenarioAudioController } from "./scenario-audio.controller";
import { DialoguePreparationService } from "./application/dialogue-preparation.service";
import { DialoguePreparationWorker } from "./application/dialogue-preparation.worker";
import { DialoguePreparationController } from "./dialogue-preparation.controller";
import { TextAiAdapterModule } from "@/modules/ai-gateway/infrastructure/text-ai-adapter.module";

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    CallRecordingModule,
    ScenarioEngineModule,
    SpeechSynthesisModule,
    TextAiAdapterModule,
  ],
  providers: [
    ScenarioAudioService,
    DialoguePreparationService,
    DialoguePreparationWorker,
  ],
  controllers: [ScenarioAudioController, DialoguePreparationController],
  exports: [ScenarioAudioService],
})
export class ScenarioAudioModule {}
