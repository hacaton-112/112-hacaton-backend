export type CallerReplyValidationReason =
  | "invalid-schema"
  | "instruction-leak"
  | "operator-echo"
  /** Реплика пересказывает предыдущую: заявитель ходит по кругу. */
  | "repeats-previous";

export class CallerReplyValidationError extends Error {
  public readonly reason: CallerReplyValidationReason;

  constructor(reason: CallerReplyValidationReason, message: string) {
    super(message);
    this.name = CallerReplyValidationError.name;
    this.reason = reason;
  }
}
