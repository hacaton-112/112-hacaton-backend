import type { GenerateCallerReplyRequest, LlmStreamEvent } from "@/contracts";

export interface LlmPort {
  /** Provider policy affects style only, never response validation or safety retries. */
  readonly replyPolicy?: {
    readonly retryNearRepetition: boolean;
    readonly preserveLiteralText: boolean;
  };
  streamReply(
    request: GenerateCallerReplyRequest,
    signal: AbortSignal,
  ): AsyncIterable<LlmStreamEvent>;
}
