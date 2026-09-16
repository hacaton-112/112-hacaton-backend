import type { DdsResponseStatus } from "./dds-response-status";

const ACKNOWLEDGEMENT_WEIGHT = 40;
const COMPLETION_WEIGHT = 60;
const REFUSAL_WEIGHT = 20;
const PASS_THRESHOLD = 75;

export const DDS_EXERCISE_VIOLATIONS = [
  "acknowledgement_deadline_missed",
  "response_refused",
] as const;

export type DdsExerciseViolation = (typeof DDS_EXERCISE_VIOLATIONS)[number];

export interface DdsExerciseEvaluation {
  readonly score: number;
  readonly passed: boolean;
  readonly acknowledgementMet: boolean;
  readonly terminalStatus: "completed" | "refused";
  readonly violations: DdsExerciseViolation[];
}

/**
 * The addressed service comes from the scenario's expected services, so a
 * completed response is the successful path. A documented refusal still earns
 * workflow credit, but cannot pass the exercise by itself.
 */
export function evaluateDdsExercise(input: {
  readonly status: DdsResponseStatus;
  readonly acknowledgementDeadlineAt: Date;
  readonly acknowledgedAt: Date | null;
}): DdsExerciseEvaluation | null {
  if (input.status !== "completed" && input.status !== "refused") {
    return null;
  }

  const acknowledgementMet =
    input.acknowledgedAt !== null &&
    input.acknowledgedAt.getTime() <= input.acknowledgementDeadlineAt.getTime();
  const workflowScore =
    input.status === "completed" ? COMPLETION_WEIGHT : REFUSAL_WEIGHT;
  const score =
    (acknowledgementMet ? ACKNOWLEDGEMENT_WEIGHT : 0) + workflowScore;
  const violations: DdsExerciseViolation[] = [];

  if (!acknowledgementMet) {
    violations.push("acknowledgement_deadline_missed");
  }

  if (input.status === "refused") {
    violations.push("response_refused");
  }

  return {
    score,
    passed: score >= PASS_THRESHOLD,
    acknowledgementMet,
    terminalStatus: input.status,
    violations,
  };
}
