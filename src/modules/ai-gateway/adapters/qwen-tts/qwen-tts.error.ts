import { z } from "zod";

export const QwenTtsErrorCodeSchema = z.enum([
  "http-error",
  "invalid-response",
  "timeout",
  "transport-error",
]);

export type QwenTtsErrorCode = z.infer<typeof QwenTtsErrorCodeSchema>;

export interface QwenTtsErrorOptions {
  readonly status?: number;
  readonly retryable?: boolean;
}

export class QwenTtsError extends Error {
  public readonly status: number | undefined;
  public readonly retryable: boolean;

  constructor(
    public readonly code: QwenTtsErrorCode,
    message: string,
    options: QwenTtsErrorOptions = {},
  ) {
    super(message);
    this.name = QwenTtsError.name;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}
