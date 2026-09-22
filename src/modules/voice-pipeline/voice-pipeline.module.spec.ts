import "reflect-metadata";

// The module tree now reaches AuthModule, and @nestjs/jwt is ESM-only, so the
// CommonJS test runner cannot require it. This spec only reads metadata, so a
// stub is enough to keep the import chain loadable.
jest.mock("@nestjs/jwt", () => ({
  JwtModule: { register: () => ({ module: class JwtModuleStub {} }) },
  JwtService: class JwtServiceStub {},
}));

// AuthModule reads the validated environment at import time, and @t3-oss/env-core
// is ESM-only as well; the metadata assertions do not depend on real values.
jest.mock("@/core/config/env.config", () => ({
  env: {
    JWT_SECRET: "test-secret-value-with-at-least-32-chars",
    JWT_ACCESS_TTL_SECONDS: 3_600,
  },
}));

import { MODULE_METADATA } from "@nestjs/common/constants";
import { ConfigModule } from "@nestjs/config";

import { AliceAiAdapterModule } from "@/modules/ai-gateway";
import { AsrModule } from "@/modules/asr/asr.module";
import { AuthModule } from "@/modules/auth/auth.module";
import { IncidentCardModule } from "@/modules/incident-card";
import { CallRecordingModule } from "@/modules/call-recording";
import { DialogueGenerationModule } from "@/modules/dialogue-generation";
import { ScenarioEngineModule } from "@/modules/scenario-engine";
import { SpeechSynthesisModule } from "@/modules/speech-synthesis";
import { TrainingModule } from "@/modules/training/training.module";
import { ScenarioAudioModule } from "@/modules/scenario-audio/scenario-audio.module";

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
  it("composes authentication, dialogue generation and speech synthesis", () => {
    expect(getModuleMetadata(MODULE_METADATA.IMPORTS)).toEqual([
      ConfigModule,
      AsrModule,
      AuthModule,
      CallRecordingModule,
      ScenarioEngineModule,
      DialogueGenerationModule,
      // Разбор вопроса оператора — второй порт того же провайдера.
      AliceAiAdapterModule,
      IncidentCardModule,
      SpeechSynthesisModule,
      TrainingModule,
      ScenarioAudioModule,
    ]);
  });

  it("registers the transport configuration and request factory", () => {
    expect(getModuleMetadata(MODULE_METADATA.PROVIDERS)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provide: VOICE_PIPELINE_TRANSPORT_CONFIG }),
        DemoVoicePipelineRequestFactory,
        expect.objectContaining({ provide: VOICE_PIPELINE_REQUEST_FACTORY }),
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
