import "reflect-metadata";

import { MODULE_METADATA } from "@nestjs/common/constants";
import { ConfigModule } from "@nestjs/config";

import { DialogueGenerationModule } from "@/modules/dialogue-generation";
import { SpeechSynthesisModule } from "@/modules/speech-synthesis";

import { VoicePipelineService } from "./application/voice-pipeline.service";
import { DemoVoicePipelineRequestFactory } from "./infrastructure/demo-voice-pipeline-request.factory";
import { VoicePipelineGateway } from "./transport/websocket/voice-pipeline.gateway";
import { VoicePipelineModule } from "./voice-pipeline.module";
import {
  VOICE_PIPELINE_REQUEST_FACTORY,
  VOICE_PIPELINE_TRANSPORT_CONFIG,
} from "./voice-pipeline.tokens";

const getModuleMetadata = (metadataKey: string): readonly unknown[] =>
  (Reflect.getMetadata(metadataKey, VoicePipelineModule) as
    readonly unknown[] | undefined) ?? [];

describe(VoicePipelineModule.name, () => {
  it("composes dialogue generation and speech synthesis", () => {
    expect(getModuleMetadata(MODULE_METADATA.IMPORTS)).toEqual([
      ConfigModule,
      DialogueGenerationModule,
      SpeechSynthesisModule,
    ]);
  });

  it("registers the transport configuration and request factory", () => {
    expect(getModuleMetadata(MODULE_METADATA.PROVIDERS)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provide: VOICE_PIPELINE_TRANSPORT_CONFIG }),
        DemoVoicePipelineRequestFactory,
        {
          provide: VOICE_PIPELINE_REQUEST_FACTORY,
          useExisting: DemoVoicePipelineRequestFactory,
        },
      ]),
    );
  });

  it("provides the gateway and exports the pipeline service", () => {
    expect(getModuleMetadata(MODULE_METADATA.PROVIDERS)).toEqual(
      expect.arrayContaining([VoicePipelineService, VoicePipelineGateway]),
    );
    expect(getModuleMetadata(MODULE_METADATA.EXPORTS)).toEqual([
      VoicePipelineService,
    ]);
  });
});
