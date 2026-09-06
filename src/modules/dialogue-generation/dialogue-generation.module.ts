import { Module } from "@nestjs/common";

import { CallerReplySafetyService } from "./application/caller-reply-safety.service";
import { DialogueGenerationService } from "./application/dialogue-generation.service";
import { LlmReplyStreamCollector } from "./application/llm-reply-stream.collector";

@Module({
  providers: [
    CallerReplySafetyService,
    LlmReplyStreamCollector,
    DialogueGenerationService,
  ],
  exports: [DialogueGenerationService],
})
export class DialogueGenerationModule {}
