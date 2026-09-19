import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "@/modules/auth/auth.module";
import { CallRecordingModule } from "@/modules/call-recording";
import { ScenarioEngineModule } from "@/modules/scenario-engine";
import { SpeechSynthesisModule } from "@/modules/speech-synthesis";
import { ScenarioAudioService } from "./scenario-audio.service";
import { ScenarioAudioController } from "./scenario-audio.controller";

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    CallRecordingModule,
    ScenarioEngineModule,
    SpeechSynthesisModule,
  ],
  providers: [ScenarioAudioService],
  controllers: [ScenarioAudioController],
  exports: [ScenarioAudioService],
})
export class ScenarioAudioModule {}
