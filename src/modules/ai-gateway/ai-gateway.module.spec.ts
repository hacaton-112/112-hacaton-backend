import "reflect-metadata";

import { MODULE_METADATA } from "@nestjs/common/constants";

import { DialogueGenerationModule } from "@/modules/dialogue-generation/dialogue-generation.module";
import { SpeechSynthesisModule } from "@/modules/speech-synthesis/speech-synthesis.module";

import { AliceAiAdapterModule } from "./adapters/alice-ai/alice-ai-adapter.module";
import { AliceAiLlmAdapter } from "./adapters/alice-ai/alice-ai.adapter";
import { MlxAudioTtsAdapter } from "./adapters/qwen-tts/mlx-audio/mlx-audio-tts.adapter";
import { QwenTtsAdapterModule } from "./adapters/qwen-tts/qwen-tts-adapter.module";
import { AiGatewayModule } from "./ai-gateway.module";
import { LLM_PORT, TTS_PORT } from "./ai-gateway.tokens";

const getModuleMetadata = (
  metadataKey: string,
  target: object,
): readonly unknown[] =>
  (Reflect.getMetadata(metadataKey, target) as
    readonly unknown[] | undefined) ?? [];

describe("AI provider module registration", () => {
  it("keeps LLM and TTS provider tokens isolated", () => {
    const aliceProviders = getModuleMetadata(
      MODULE_METADATA.PROVIDERS,
      AliceAiAdapterModule,
    );
    const qwenProviders = getModuleMetadata(
      MODULE_METADATA.PROVIDERS,
      QwenTtsAdapterModule,
    );

    expect(aliceProviders).toContainEqual({
      provide: LLM_PORT,
      useExisting: AliceAiLlmAdapter,
    });
    expect(aliceProviders).not.toContainEqual(
      expect.objectContaining({ provide: TTS_PORT }),
    );
    expect(qwenProviders).toContainEqual({
      provide: TTS_PORT,
      useExisting: MlxAudioTtsAdapter,
    });
    expect(qwenProviders).not.toContainEqual(
      expect.objectContaining({ provide: LLM_PORT }),
    );
  });

  it("imports only the provider required by each orchestration module", () => {
    expect(
      getModuleMetadata(MODULE_METADATA.IMPORTS, DialogueGenerationModule),
    ).toEqual([AliceAiAdapterModule]);
    expect(
      getModuleMetadata(MODULE_METADATA.IMPORTS, SpeechSynthesisModule),
    ).toEqual([QwenTtsAdapterModule]);
  });

  it("exposes both isolated provider modules through the gateway aggregator", () => {
    const expectedModules = [AliceAiAdapterModule, QwenTtsAdapterModule];

    expect(getModuleMetadata(MODULE_METADATA.IMPORTS, AiGatewayModule)).toEqual(
      expectedModules,
    );
    expect(getModuleMetadata(MODULE_METADATA.EXPORTS, AiGatewayModule)).toEqual(
      expectedModules,
    );
    expect(
      getModuleMetadata(MODULE_METADATA.EXPORTS, AliceAiAdapterModule),
    ).toEqual([LLM_PORT]);
    expect(
      getModuleMetadata(MODULE_METADATA.EXPORTS, QwenTtsAdapterModule),
    ).toEqual([TTS_PORT]);
  });
});
