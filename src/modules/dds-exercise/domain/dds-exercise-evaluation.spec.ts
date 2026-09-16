import { evaluateDdsExercise } from "./dds-exercise-evaluation";

const deadline = new Date("2026-09-15T12:00:30.000Z");

describe(evaluateDdsExercise.name, () => {
  it("passes a completed response acknowledged within 30 seconds", () => {
    expect(
      evaluateDdsExercise({
        status: "completed",
        acknowledgementDeadlineAt: deadline,
        acknowledgedAt: new Date("2026-09-15T12:00:29.000Z"),
      }),
    ).toEqual({
      score: 100,
      passed: true,
      acknowledgementMet: true,
      terminalStatus: "completed",
      violations: [],
    });
  });

  it("fails a late response even when all work statuses were completed", () => {
    expect(
      evaluateDdsExercise({
        status: "completed",
        acknowledgementDeadlineAt: deadline,
        acknowledgedAt: new Date("2026-09-15T12:00:31.000Z"),
      }),
    ).toMatchObject({
      score: 60,
      passed: false,
      violations: ["acknowledgement_deadline_missed"],
    });
  });

  it("keeps a documented refusal below the pass threshold", () => {
    expect(
      evaluateDdsExercise({
        status: "refused",
        acknowledgementDeadlineAt: deadline,
        acknowledgedAt: new Date("2026-09-15T12:00:10.000Z"),
      }),
    ).toMatchObject({
      score: 60,
      passed: false,
      violations: ["response_refused"],
    });
  });

  it("does not evaluate an unfinished exercise", () => {
    expect(
      evaluateDdsExercise({
        status: "working",
        acknowledgementDeadlineAt: deadline,
        acknowledgedAt: new Date("2026-09-15T12:00:10.000Z"),
      }),
    ).toBeNull();
  });
});
