export type LlmReplyCollectionFailure =
  | "invalid-event"
  | "invalid-json"
  | "protocol-error"
  | "response-too-large";

export class LlmReplyCollectionError extends Error {
  public readonly failure: LlmReplyCollectionFailure;

  constructor(failure: LlmReplyCollectionFailure, message: string) {
    super(message);
    this.name = LlmReplyCollectionError.name;
    this.failure = failure;
  }
}
