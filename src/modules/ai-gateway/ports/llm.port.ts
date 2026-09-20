import type { GenerateCallerReplyRequest, LlmStreamEvent } from "@/contracts";

export interface LlmPort {
  /** Adapter policy affects style only; schema/fact validation is never disabled. */
  readonly replyPolicy?: {
    readonly retryNearRepetition: boolean;
    readonly preserveLiteralText: boolean;
  };
  streamReply(
    request: GenerateCallerReplyRequest,
    signal: AbortSignal,
  ): AsyncIterable<LlmStreamEvent>;
}
