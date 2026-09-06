export type CallerReplyValidationReason =
  | "invalid-schema"
  | "forbidden-fact";

export class CallerReplyValidationError extends Error {
  public readonly reason: CallerReplyValidationReason;

  constructor(reason: CallerReplyValidationReason, message: string) {
    super(message);
    this.name = CallerReplyValidationError.name;
    this.reason = reason;
  }
}
