import { z } from "zod";

export const VoicePipelineErrorCodeSchema = z.enum([
  "generation-failed",
  "synthesis-failed",
  "protocol-error",
]);

export const VoicePipelineFailureMetricsSchema = z
  .object({
    durationMs: z.number().nonnegative(),
    timeToReplyMs: z.number().nonnegative().nullable(),
    timeToFirstAudioMs: z.number().nonnegative().nullable(),
    audioChunkCount: z.number().int().nonnegative(),
    audioBytes: z.number().int().nonnegative().multipleOf(2),
  })
  .strict();

export type VoicePipelineErrorCode = z.infer<
  typeof VoicePipelineErrorCodeSchema
>;
export type VoicePipelineFailureMetrics = z.infer<
  typeof VoicePipelineFailureMetricsSchema
>;

const errorMessages = {
  "generation-failed": "Voice pipeline failed to generate a caller reply",
  "synthesis-failed": "Voice pipeline failed to synthesize caller audio",
  "protocol-error": "Voice pipeline received an invalid synthesis event stream",
} as const satisfies Record<VoicePipelineErrorCode, string>;

export class VoicePipelineError extends Error {
  public readonly metrics: VoicePipelineFailureMetrics;

  constructor(
    public readonly code: VoicePipelineErrorCode,
    metrics: VoicePipelineFailureMetrics,
  ) {
    super(errorMessages[code]);
    this.name = VoicePipelineError.name;
    this.metrics = VoicePipelineFailureMetricsSchema.parse(metrics);
  }
}
