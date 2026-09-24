import type { InstructorReportAttempt } from "../dto/instructor-report.dto";
import {
  summarizeReportAttempts,
  summarizeReportStudents,
} from "./report-aggregation";

const attempt = (
  overrides: Partial<InstructorReportAttempt> = {},
): InstructorReportAttempt => ({
  trainingSessionId: "00000000-0000-4000-8000-000000000001",
  assignmentId: "00000000-0000-4000-8000-000000000002",
  assignmentTitle: "Пожар",
  groupId: "00000000-0000-4000-8000-000000000003",
  groupName: "Смена А",
  operatorId: "00000000-0000-4000-8000-000000000004",
  operatorName: "Анна Оператор",
  scenarioCode: "FIRE-01",
  scenarioTitle: "Пожар в квартире",
  attemptNumber: 1,
  status: "completed",
  offeredAt: "2026-09-16T10:00:00.000Z",
  answeredAt: "2026-09-16T10:00:05.000Z",
  endedAt: "2026-09-16T10:02:05.000Z",
  answerSeconds: 5,
  answerNormSeconds: 30,
  answeredWithinNorm: true,
  durationSeconds: 120,
  expectedDurationSeconds: 180,
  score: 80,
  passThreshold: 75,
  passed: true,
  analysis: {
    status: "ready",
    timelineEvents: 12,
    questionsSatisfied: 4,
    questionsTotal: 5,
    factsRevealed: 5,
    factsTotal: 6,
    criticalQuestionsMissed: 0,
    requiredFieldsMissing: 1,
    incorrectFields: 0,
    incidentCardCompleted: true,
    fields: [],
    recommendations: [],
  },
  grammar: { status: "unavailable", message: "Недоступно" },
  ...overrides,
});

describe("instructor report aggregation", () => {
  it("summarizes scores, pass rate and timings without treating nulls as zero", () => {
    const stats = summarizeReportAttempts([
      attempt(),
      attempt({
        trainingSessionId: "00000000-0000-4000-8000-000000000005",
        offeredAt: "2026-09-17T10:00:00.000Z",
        score: 60,
        passed: false,
        answerSeconds: 15,
        durationSeconds: null,
      }),
      attempt({
        trainingSessionId: "00000000-0000-4000-8000-000000000006",
        status: "active",
        score: null,
        passed: null,
        answerSeconds: null,
        durationSeconds: null,
      }),
    ]);

    expect(stats).toEqual({
      attempts: 3,
      completedAttempts: 2,
      evaluatedAttempts: 2,
      passedAttempts: 1,
      passRate: 50,
      averageScore: 70,
      bestScore: 80,
      averageAnswerSeconds: 10,
      averageDurationSeconds: 120,
      lastAttemptAt: "2026-09-17T10:00:00.000Z",
    });
  });

  it("keeps current group members with zero attempts and former members with calls", () => {
    const students = summarizeReportStudents(
      [
        {
          id: "00000000-0000-4000-8000-000000000004",
          fullName: "Анна Оператор",
          email: "anna@example.test",
          serviceTags: ["101"],
        },
        {
          id: "00000000-0000-4000-8000-000000000007",
          fullName: "Борис Оператор",
          email: "boris@example.test",
          serviceTags: ["102"],
        },
      ],
      [
        attempt(),
        attempt({
          trainingSessionId: "00000000-0000-4000-8000-000000000008",
          operatorId: "00000000-0000-4000-8000-000000000009",
          operatorName: "Вера Бывшая",
        }),
      ],
    );

    expect(students.map(({ operatorName }) => operatorName)).toEqual([
      "Анна Оператор",
      "Борис Оператор",
      "Вера Бывшая",
    ]);
    expect(students[1]?.stats.attempts).toBe(0);
    expect(students[2]).toMatchObject({ email: null, serviceTags: [] });
  });
});
