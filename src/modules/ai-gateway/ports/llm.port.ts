import type { GenerateCallerReplyRequest, LlmStreamEvent } from "@/contracts";

export interface LlmPort {
  streamReply(
    request: GenerateCallerReplyRequest,
    signal: AbortSignal,
  ): AsyncIterable<LlmStreamEvent>;
}
