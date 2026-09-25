import "reflect-metadata";

import { MODULE_METADATA } from "@nestjs/common/constants";

import { DialogueGenerationModule } from "@/modules/dialogue-generation/dialogue-generation.module";
import { SpeechSynthesisModule } from "@/modules/speech-synthesis/speech-synthesis.module";

import { TextAiAdapterModule } from "@/modules/ai-gateway/infrastructure/text-ai-adapter.module";
import { TtsAdapterModule } from "@/modules/ai-gateway/infrastructure/tts/tts-adapter.module";
import {
  TTS_CONFIG,
  TTS_FETCH,
} from "@/modules/ai-gateway/infrastructure/tts/tts.tokens";
import { AiGatewayModule } from "@/modules/ai-gateway/ai-gateway.module";
import { LLM_PORT, TTS_PORT } from "@/modules/ai-gateway/ai-gateway.tokens";
import { QUESTION_UNDERSTANDING_PORT } from "@/modules/ai-gateway/ports/question-understanding.port";
import { STRUCTURED_OUTPUT_PORT } from "@/modules/ai-gateway/ports/structured-output.port";

const getModuleMetadata = (
  metadataKey: string,
  target: object,
): readonly unknown[] =>
  (Reflect.getMetadata(metadataKey, target) as
    readonly unknown[] | undefined) ?? [];

describe("AI provider module registration", () => {
  it("keeps LLM and TTS provider tokens isolated", () => {
    const textProviders = getModuleMetadata(
      MODULE_METADATA.PROVIDERS,
      TextAiAdapterModule,
    );
    const ttsProviders = getModuleMetadata(
      MODULE_METADATA.PROVIDERS,
      TtsAdapterModule,
    );

    expect(textProviders).toContainEqual(
      expect.objectContaining({
        provide: LLM_PORT,
        useFactory: expect.any(Function),
      }),
    );
    expect(textProviders).not.toContainEqual(
      expect.objectContaining({ provide: TTS_PORT }),
    );
    expect(ttsProviders).toContainEqual({
      provide: TTS_PORT,
      inject: [TTS_CONFIG, TTS_FETCH],
      useFactory: expect.any(Function),
    });
    expect(ttsProviders).not.toContainEqual(
      expect.objectContaining({ provide: LLM_PORT }),
    );
  });

  it("imports only the provider required by each orchestration module", () => {
    expect(
      getModuleMetadata(MODULE_METADATA.IMPORTS, DialogueGenerationModule),
    ).toEqual([TextAiAdapterModule]);
    expect(
      getModuleMetadata(MODULE_METADATA.IMPORTS, SpeechSynthesisModule),
    ).toEqual([TtsAdapterModule]);
  });

  it("exposes both isolated provider modules through the gateway aggregator", () => {
    const expectedModules = [TextAiAdapterModule, TtsAdapterModule];

    expect(getModuleMetadata(MODULE_METADATA.IMPORTS, AiGatewayModule)).toEqual(
      expectedModules,
    );
    expect(getModuleMetadata(MODULE_METADATA.EXPORTS, AiGatewayModule)).toEqual(
      expectedModules,
    );
    // Разбор вопроса оператора — вторая работа того же провайдера, и порт у неё
    // свой: играть заявителя и отвечать на служебный вопрос движка — разное.
    expect(
      getModuleMetadata(MODULE_METADATA.EXPORTS, TextAiAdapterModule),
    ).toEqual([
      LLM_PORT,
      STRUCTURED_OUTPUT_PORT,
      QUESTION_UNDERSTANDING_PORT,
    ]);
    expect(
      getModuleMetadata(MODULE_METADATA.EXPORTS, TtsAdapterModule),
    ).toEqual([TTS_PORT]);
  });
});
