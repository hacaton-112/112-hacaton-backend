import { Module } from "@nestjs/common";

import { AliceAiAdapterModule } from "@/modules/ai-gateway";

import { CallerReplySafetyService } from "./application/caller-reply-safety.service";
import { DialogueGenerationService } from "./application/dialogue-generation.service";
import { LlmReplyStreamCollector } from "./application/llm-reply-stream.collector";

@Module({
  imports: [AliceAiAdapterModule],
  providers: [
    CallerReplySafetyService,
    LlmReplyStreamCollector,
    DialogueGenerationService,
  ],
  exports: [DialogueGenerationService],
})
export class DialogueGenerationModule {}
