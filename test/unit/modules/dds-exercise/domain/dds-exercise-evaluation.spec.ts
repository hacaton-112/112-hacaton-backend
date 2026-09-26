import {
  combineDdsTextScore,
  evaluateDdsExercise,
} from "@/modules/dds-exercise/domain/dds-exercise-evaluation";

describe(combineDdsTextScore.name, () => {
  it("adds deterministic coverage and grammar parts", () => {
    expect(
      combineDdsTextScore({
        baseScore: 100,
        presentItems: 3,
        totalItems: 4,
        contradictions: 0,
        grammarErrors: 0,
        grammarStyleIssues: 1,
      }),
    ).toEqual({ score: 93, passed: true });
  });

  it("keeps a heavily penalized score at zero", () => {
    expect(
      combineDdsTextScore({
        baseScore: 0,
        presentItems: 0,
        totalItems: 1,
        contradictions: 20,
        grammarErrors: 10,
        grammarStyleIssues: 10,
      }).score,
    ).toBe(0);
  });
});

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

  describe("with a crew handoff over the phone", () => {
    const acknowledgedAt = new Date("2026-09-15T12:00:20.000Z");
    const at = (seconds: number) =>
      new Date(acknowledgedAt.getTime() + seconds * 1_000);

    it("gives full marks for the right crew called in time", () => {
      expect(
        evaluateDdsExercise({
          status: "completed",
          acknowledgementDeadlineAt: deadline,
          acknowledgedAt,
          handoff: { completedCallStartedAt: at(40), wrongCallsBefore: 0 },
        }),
      ).toMatchObject({ score: 100, passed: true, violations: [] });
    });

    it("keeps a late handoff above the threshold but records it", () => {
      expect(
        evaluateDdsExercise({
          status: "completed",
          acknowledgementDeadlineAt: deadline,
          acknowledgedAt,
          handoff: { completedCallStartedAt: at(90), wrongCallsBefore: 0 },
        }),
      ).toMatchObject({
        score: 85,
        passed: true,
        violations: ["crew_handoff_late"],
      });
    });

    it("takes points for every wrong number dialed first", () => {
      expect(
        evaluateDdsExercise({
          status: "completed",
          acknowledgementDeadlineAt: deadline,
          acknowledgedAt,
          handoff: { completedCallStartedAt: at(40), wrongCallsBefore: 2 },
        }),
      ).toMatchObject({ score: 80, violations: ["wrong_crew_dialed"] });
    });

    it("does not blame a refusal made before any crew was called", () => {
      // Отказ до звонка законен: наряд не поднимают на непринятую карточку.
      expect(
        evaluateDdsExercise({
          status: "refused",
          acknowledgementDeadlineAt: deadline,
          acknowledgedAt,
          handoff: { completedCallStartedAt: null, wrongCallsBefore: 0 },
        }),
      ).toMatchObject({
        score: 45,
        passed: false,
        violations: ["response_refused"],
      });
    });

    it("fails a response completed without ever calling the crew", () => {
      expect(
        evaluateDdsExercise({
          status: "completed",
          acknowledgementDeadlineAt: deadline,
          acknowledgedAt,
          handoff: { completedCallStartedAt: null, wrongCallsBefore: 0 },
        }),
      ).toMatchObject({
        score: 70,
        passed: false,
        violations: ["crew_handoff_missing"],
      });
    });

    it("honours the threshold of the assignment that opened the card", () => {
      const input = {
        status: "completed",
        acknowledgementDeadlineAt: deadline,
        acknowledgedAt,
        handoff: { completedCallStartedAt: null, wrongCallsBefore: 0 },
      } as const;

      expect(
        evaluateDdsExercise({ ...input, passThreshold: 60 }),
      ).toMatchObject({ score: 70, passed: true });
      expect(
        evaluateDdsExercise({ ...input, passThreshold: 90 }),
      ).toMatchObject({ score: 70, passed: false });
    });
  });
});
