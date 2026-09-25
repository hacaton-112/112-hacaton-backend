import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  evaluateCall,
  type EvaluationInput,
} from "@/modules/debrief/domain/evaluation";
import {
  combineDdsTextScore,
  evaluateDdsExercise,
} from "@/modules/dds-exercise/domain/dds-exercise-evaluation";

interface ExpectedResult {
  scoreMin: number;
  scoreMax: number;
  errors: string[];
  passed: boolean;
}

interface VoiceFixture {
  kind: "voice";
  description: string;
  input: EvaluationInput;
  expected: ExpectedResult;
}

interface DdsFixture {
  kind: "dds";
  description: string;
  card: {
    status: "completed" | "refused";
    deadline: string;
    acknowledgedAt: string | null;
    passThreshold: number;
    handoff?: {
      completedCallStartedAt: string | null;
      wrongCallsBefore: number;
    };
  };
  text: {
    presentItems: number;
    totalItems: number;
    contradictions: number;
    grammarErrors: number;
    grammarStyleIssues: number;
  };
  expected: ExpectedResult;
}

const directory = join(process.cwd(), "test", "fixtures", "golden");
const fixtures = readdirSync(directory)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => ({
    name,
    value: JSON.parse(readFileSync(join(directory, name), "utf8")) as
      VoiceFixture | DdsFixture,
  }));

const callErrors = (
  input: EvaluationInput,
  result: ReturnType<typeof evaluateCall>,
) => {
  const errors: string[] = [];
  if (
    input.questions.some(
      ({ isCritical, satisfied }) => isCritical && !satisfied,
    )
  )
    errors.push("critical_question_missed");
  if (result.fields.some(({ isRequired, matched }) => isRequired && !matched))
    errors.push("required_field_mismatch");
  if (
    input.expectedServices.some(
      (service) => !input.dispatchedServices.includes(service),
    )
  )
    errors.push("service_missing");
  if (
    input.answerSeconds !== null &&
    input.answerSeconds > input.answerNormSeconds
  )
    errors.push("answer_late");
  if (input.forbiddenPhrases > 0) errors.push("forbidden_phrase");
  return errors;
};

describe("golden evaluation regression", () => {
  it("contains five voice and five DDS cases", () => {
    expect(fixtures.filter(({ value }) => value.kind === "voice")).toHaveLength(
      5,
    );
    expect(fixtures.filter(({ value }) => value.kind === "dds")).toHaveLength(
      5,
    );
  });

  it.each(fixtures)("$name", ({ value }) => {
    if (value.kind === "voice") {
      const result = evaluateCall(value.input);
      expect(result.score).toBeGreaterThanOrEqual(value.expected.scoreMin);
      expect(result.score).toBeLessThanOrEqual(value.expected.scoreMax);
      expect(callErrors(value.input, result).sort()).toEqual(
        [...value.expected.errors].sort(),
      );
      expect(result.score >= value.input.passThreshold).toBe(
        value.expected.passed,
      );
      return;
    }

    const base = evaluateDdsExercise({
      status: value.card.status,
      acknowledgementDeadlineAt: new Date(value.card.deadline),
      acknowledgedAt: value.card.acknowledgedAt
        ? new Date(value.card.acknowledgedAt)
        : null,
      passThreshold: value.card.passThreshold,
      handoff: value.card.handoff
        ? {
            completedCallStartedAt: value.card.handoff.completedCallStartedAt
              ? new Date(value.card.handoff.completedCallStartedAt)
              : null,
            wrongCallsBefore: value.card.handoff.wrongCallsBefore,
          }
        : undefined,
    });
    expect(base).not.toBeNull();
    const result = combineDdsTextScore({
      baseScore: base!.score,
      ...value.text,
      passThreshold: value.card.passThreshold,
    });
    expect(result.score).toBeGreaterThanOrEqual(value.expected.scoreMin);
    expect(result.score).toBeLessThanOrEqual(value.expected.scoreMax);
    expect([...base!.violations].sort()).toEqual(
      [...value.expected.errors].sort(),
    );
    expect(result.passed).toBe(value.expected.passed);
  });
});
