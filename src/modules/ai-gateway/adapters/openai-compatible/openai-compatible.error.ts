import { z } from "zod";

export const OpenAiCompatibleErrorCodeSchema = z.enum([
  "http-error",
  "invalid-response",
  "timeout",
  "transport-error",
]);

export type OpenAiCompatibleErrorCode = z.infer<
  typeof OpenAiCompatibleErrorCodeSchema
>;

export interface OpenAiCompatibleErrorOptions {
  readonly status?: number;
  readonly retryable?: boolean;
}

/** Сбой на границе с моделью, говорящей по протоколу OpenAI. */
export class OpenAiCompatibleError extends Error {
  public readonly status: number | undefined;
  public readonly retryable: boolean;

  constructor(
    public readonly code: OpenAiCompatibleErrorCode,
    message: string,
    options: OpenAiCompatibleErrorOptions = {},
  ) {
    super(message);
    this.name = OpenAiCompatibleError.name;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}
