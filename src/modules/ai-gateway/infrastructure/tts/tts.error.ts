import { z } from "zod";

export const TtsAdapterErrorCodeSchema = z.enum([
  "http-error",
  "invalid-response",
  "timeout",
  "transport-error",
]);

export type TtsAdapterErrorCode = z.infer<typeof TtsAdapterErrorCodeSchema>;

export interface TtsAdapterErrorOptions {
  readonly status?: number;
  readonly retryable?: boolean;
}

export class TtsAdapterError extends Error {
  public readonly status: number | undefined;
  public readonly retryable: boolean;

  constructor(
    public readonly code: TtsAdapterErrorCode,
    message: string,
    options: TtsAdapterErrorOptions = {},
  ) {
    super(message);
    this.name = TtsAdapterError.name;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}
