import { z } from "zod";

export const AliceAiErrorCodeSchema = z.enum([
  "http-error",
  "invalid-response",
  "timeout",
  "transport-error",
]);

export type AliceAiErrorCode = z.infer<typeof AliceAiErrorCodeSchema>;

export interface AliceAiErrorOptions {
  readonly status?: number;
  readonly retryable?: boolean;
}

export class AliceAiError extends Error {
  public readonly status: number | undefined;
  public readonly retryable: boolean;

  constructor(
    public readonly code: AliceAiErrorCode,
    message: string,
    options: AliceAiErrorOptions = {},
  ) {
    super(message);
    this.name = AliceAiError.name;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}
