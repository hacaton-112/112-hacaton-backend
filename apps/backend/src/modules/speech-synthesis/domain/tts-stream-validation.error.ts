import { z } from "zod";

export const TtsStreamValidationErrorCodeSchema = z.enum([
  "invalid-chunk",
  "sequence-mismatch",
  "metadata-mismatch",
  "event-after-final",
  "empty-stream",
  "missing-final",
]);

export type TtsStreamValidationErrorCode = z.infer<
  typeof TtsStreamValidationErrorCodeSchema
>;

export class TtsStreamValidationError extends Error {
  constructor(
    public readonly code: TtsStreamValidationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = TtsStreamValidationError.name;
  }
}
