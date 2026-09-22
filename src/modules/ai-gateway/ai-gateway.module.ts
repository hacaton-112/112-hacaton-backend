import { Module } from "@nestjs/common";

import { TextAiAdapterModule } from "./adapters/text-ai-adapter.module";
import { QwenTtsAdapterModule } from "./adapters/qwen-tts/qwen-tts-adapter.module";

@Module({
  imports: [TextAiAdapterModule, QwenTtsAdapterModule],
  exports: [TextAiAdapterModule, QwenTtsAdapterModule],
})
export class AiGatewayModule {}
