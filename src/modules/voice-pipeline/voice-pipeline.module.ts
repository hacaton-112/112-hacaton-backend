import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { AsrModule } from "@/modules/asr/asr.module";
import { AuthModule } from "@/modules/auth/auth.module";
import { CallRecordingModule } from "@/modules/call-recording";
import { DialogueGenerationModule } from "@/modules/dialogue-generation";
import { IncidentCardModule } from "@/modules/incident-card";
import { ScenarioEngineModule } from "@/modules/scenario-engine";
import { SpeechSynthesisModule } from "@/modules/speech-synthesis";

import { VoicePipelineService } from "./application/voice-pipeline.service";
import { DemoVoicePipelineRequestFactory } from "./infrastructure/demo-voice-pipeline-request.factory";
import { ScenarioVoicePipelineRequestFactory } from "./infrastructure/scenario-voice-pipeline-request.factory";
import {
  parseVoicePipelineTransportConfig,
  type VoicePipelineTransportConfig,
  type VoicePipelineTransportEnvironment,
} from "./infrastructure/voice-pipeline-transport.config";
import { VoicePipelineGateway } from "./transport/websocket/voice-pipeline.gateway";
import {
  VOICE_PIPELINE_REQUEST_FACTORY,
  VOICE_PIPELINE_TRANSPORT_CONFIG,
} from "./voice-pipeline.tokens";

const VOICE_PIPELINE_ENVIRONMENT_KEYS = [
  "VOICE_PIPELINE_DEMO_ENABLED",
] as const satisfies readonly (keyof VoicePipelineTransportEnvironment)[];

const createVoicePipelineTransportConfig = (configService: ConfigService) =>
  parseVoicePipelineTransportConfig(
    Object.fromEntries(
      VOICE_PIPELINE_ENVIRONMENT_KEYS.map((key) => [
        key,
        configService.get(key),
      ]),
    ),
  );

@Module({
  imports: [
    ConfigModule,
    AsrModule,
    AuthModule,
    CallRecordingModule,
    ScenarioEngineModule,
    DialogueGenerationModule,
    IncidentCardModule,
    SpeechSynthesisModule,
  ],
  providers: [
    {
      provide: VOICE_PIPELINE_TRANSPORT_CONFIG,
      inject: [ConfigService],
      useFactory: createVoicePipelineTransportConfig,
    },
    DemoVoicePipelineRequestFactory,
    ScenarioVoicePipelineRequestFactory,
    {
      // Демо-фабрика остаётся для смоук-прогонов без базы; в обычном режиме
      // контекст выдаёт движок сценария.
      provide: VOICE_PIPELINE_REQUEST_FACTORY,
      inject: [
        VOICE_PIPELINE_TRANSPORT_CONFIG,
        DemoVoicePipelineRequestFactory,
        ScenarioVoicePipelineRequestFactory,
      ],
      useFactory: (
        config: VoicePipelineTransportConfig,
        demo: DemoVoicePipelineRequestFactory,
        scenario: ScenarioVoicePipelineRequestFactory,
      ) => (config.demoEnabled ? demo : scenario),
    },
    VoicePipelineService,
    VoicePipelineGateway,
  ],
  exports: [VoicePipelineService],
})
export class VoicePipelineModule {}
