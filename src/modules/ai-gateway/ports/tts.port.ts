import type { AudioChunk, TtsSynthesisRequest } from "@/contracts";

export interface TtsPort {
  synthesize(
    request: TtsSynthesisRequest,
    signal: AbortSignal,
  ): AsyncIterable<AudioChunk>;
}
