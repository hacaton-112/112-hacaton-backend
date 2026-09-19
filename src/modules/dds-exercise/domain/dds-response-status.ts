/**
 * Норматив первичного статуса из памятки АРМ-112.
 *
 * Одно число на весь модуль: по нему и назначается срок доставки, и считается
 * нарушение в оценке, иначе диспетчер и отчёт расходятся во мнении о сроке.
 */
export const ACKNOWLEDGEMENT_NORM_MS = 30_000;

export const DDS_RESPONSE_STATUSES = [
  "pending",
  "accepted",
  "not_accepted",
  "responding",
  "arrived",
  "working",
  "completed",
  "refused",
] as const;

export type DdsResponseStatus = (typeof DDS_RESPONSE_STATUSES)[number];

const NEXT_STATUSES: Record<DdsResponseStatus, readonly DdsResponseStatus[]> = {
  pending: ["accepted", "not_accepted"],
  not_accepted: ["accepted"],
  accepted: ["responding", "refused"],
  responding: ["arrived", "refused"],
  arrived: ["working", "refused"],
  working: ["completed", "refused"],
  completed: [],
  refused: [],
};

export type DdsTransitionErrorReason =
  "invalid-transition" | "comment-required";

export class DdsTransitionError extends Error {
  constructor(public readonly reason: DdsTransitionErrorReason) {
    super(`DDS response transition rejected: ${reason}`);
    this.name = DdsTransitionError.name;
  }
}

export const allowedDdsTransitions = (
  status: DdsResponseStatus,
): readonly DdsResponseStatus[] => NEXT_STATUSES[status];

export const isTerminalDdsStatus = (status: DdsResponseStatus): boolean =>
  status === "completed" || status === "refused";

export const requiresDdsComment = (status: DdsResponseStatus): boolean =>
  status === "not_accepted" || status === "refused";

/**
 * Pure status rule used before persistence. The store repeats the expected
 * current status in its UPDATE condition so concurrent commands cannot skip a
 * stage after this check.
 */
export function validateDdsTransition(input: {
  readonly current: DdsResponseStatus;
  readonly next: DdsResponseStatus;
  readonly comment?: string;
}): string | null {
  if (!NEXT_STATUSES[input.current].includes(input.next)) {
    throw new DdsTransitionError("invalid-transition");
  }

  const comment = input.comment?.trim() || null;

  if (requiresDdsComment(input.next) && comment === null) {
    throw new DdsTransitionError("comment-required");
  }

  return comment;
}
