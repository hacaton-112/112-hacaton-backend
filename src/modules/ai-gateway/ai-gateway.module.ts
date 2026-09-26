import { Module } from "@nestjs/common";

import { TextAiAdapterModule } from "./infrastructure/text-ai-adapter.module";
import { TtsAdapterModule } from "./infrastructure/tts/tts-adapter.module";

@Module({
  imports: [TextAiAdapterModule, TtsAdapterModule],
  exports: [TextAiAdapterModule, TtsAdapterModule],
})
export class AiGatewayModule {}
