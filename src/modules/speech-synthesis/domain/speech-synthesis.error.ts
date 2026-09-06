import { z } from "zod";

import type { SpeechSynthesisAttemptMetrics } from "@/contracts";

export const SpeechSynthesisErrorCodeSchema = z.enum([
  "invalid-stream",
  "provider-error",
]);

export type SpeechSynthesisErrorCode = z.infer<
  typeof SpeechSynthesisErrorCodeSchema
>;

const errorMessages = {
  "invalid-stream": "TTS returned an invalid audio stream",
  "provider-error": "TTS provider failed before synthesis completed",
} as const satisfies Record<SpeechSynthesisErrorCode, string>;

export class SpeechSynthesisError extends Error {
  public readonly attempts: readonly SpeechSynthesisAttemptMetrics[];

  constructor(
    public readonly code: SpeechSynthesisErrorCode,
    attempts: readonly SpeechSynthesisAttemptMetrics[],
  ) {
    super(errorMessages[code]);
    this.name = SpeechSynthesisError.name;
    this.attempts = [...attempts];
  }
}
