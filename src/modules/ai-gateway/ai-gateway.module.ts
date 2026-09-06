import { Module } from "@nestjs/common";

import { AliceAiAdapterModule } from "./adapters/alice-ai/alice-ai-adapter.module";
import { QwenTtsAdapterModule } from "./adapters/qwen-tts/qwen-tts-adapter.module";

@Module({
  imports: [AliceAiAdapterModule, QwenTtsAdapterModule],
  exports: [AliceAiAdapterModule, QwenTtsAdapterModule],
})
export class AiGatewayModule {}
