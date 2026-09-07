import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { DialogueGenerationModule } from "@/modules/dialogue-generation";
import { SpeechSynthesisModule } from "@/modules/speech-synthesis";

import { VoicePipelineService } from "./application/voice-pipeline.service";
import { DemoVoicePipelineRequestFactory } from "./infrastructure/demo-voice-pipeline-request.factory";
import {
  parseVoicePipelineTransportConfig,
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
  imports: [ConfigModule, DialogueGenerationModule, SpeechSynthesisModule],
  providers: [
    {
      provide: VOICE_PIPELINE_TRANSPORT_CONFIG,
      inject: [ConfigService],
      useFactory: createVoicePipelineTransportConfig,
    },
    DemoVoicePipelineRequestFactory,
    {
      provide: VOICE_PIPELINE_REQUEST_FACTORY,
      useExisting: DemoVoicePipelineRequestFactory,
    },
    VoicePipelineService,
    VoicePipelineGateway,
  ],
  exports: [VoicePipelineService],
})
export class VoicePipelineModule {}
