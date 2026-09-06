import "reflect-metadata";

import { MODULE_METADATA } from "@nestjs/common/constants";

import { DialogueGenerationModule } from "@/modules/dialogue-generation";
import { SpeechSynthesisModule } from "@/modules/speech-synthesis";

import { VoicePipelineService } from "./application/voice-pipeline.service";
import { VoicePipelineModule } from "./voice-pipeline.module";

const getModuleMetadata = (metadataKey: string): readonly unknown[] =>
  (Reflect.getMetadata(metadataKey, VoicePipelineModule) as
    readonly unknown[] | undefined) ?? [];

describe(VoicePipelineModule.name, () => {
  it("composes dialogue generation and speech synthesis", () => {
    expect(getModuleMetadata(MODULE_METADATA.IMPORTS)).toEqual([
      DialogueGenerationModule,
      SpeechSynthesisModule,
    ]);
  });

  it("provides and exports the pipeline service", () => {
    expect(getModuleMetadata(MODULE_METADATA.PROVIDERS)).toEqual([
      VoicePipelineService,
    ]);
    expect(getModuleMetadata(MODULE_METADATA.EXPORTS)).toEqual([
      VoicePipelineService,
    ]);
  });
});
