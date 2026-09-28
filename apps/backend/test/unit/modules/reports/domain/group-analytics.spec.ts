import { INCIDENT_CARD_FIELDS } from "@/drizzle/schema";
import type { InstructorReportAttempt } from "@/modules/reports/dto/instructor-report.dto";
import { summarizeGroupAnalytics } from "@/modules/reports/domain/group-analytics";

const attempt = (
  occurredAt: string,
  matched: boolean,
): InstructorReportAttempt => ({
  trainingSessionId: "10000000-0000-4000-8000-000000000001",
  assignmentId: "20000000-0000-4000-8000-000000000001",
  assignmentTitle: "Тренировка",
  groupId: "30000000-0000-4000-8000-000000000001",
  groupName: "Группа",
  operatorId: "40000000-0000-4000-8000-000000000001",
  operatorName: "Стажёр",
  scenarioCode: "FIRE-1",
  scenarioTitle: "Пожар",
  attemptNumber: 1,
  status: "completed",
  offeredAt: occurredAt,
  answeredAt: occurredAt,
  endedAt: occurredAt,
  answerSeconds: 5,
  answerNormSeconds: 30,
  answeredWithinNorm: true,
  durationSeconds: 60,
  expectedDurationSeconds: 60,
  score: matched ? 90 : 40,
  passThreshold: 75,
  passed: matched,
  analysis: {
    status: "ready",
    timelineEvents: 1,
    questionsSatisfied: 1,
    questionsTotal: 1,
    factsRevealed: 1,
    factsTotal: 1,
    criticalQuestionsMissed: 0,
    requiredFieldsMissing: matched ? 0 : 1,
    incorrectFields: 0,
    incidentCardCompleted: true,
    fields: [{ field: "address", matched, isRequired: true }],
    recommendations: [],
  },
  grammar: { status: "unavailable", message: "Недоступно" },
});

describe(summarizeGroupAnalytics.name, () => {
  it("counts corrected fields, DDS misses and builds a matrix", () => {
    const result = summarizeGroupAnalytics(
      [attempt("2026-01-01T10:00:00.000Z", false), attempt("2026-01-02T10:00:00.000Z", true)],
      [{
        exerciseId: "50000000-0000-4000-8000-000000000001",
        operatorId: "40000000-0000-4000-8000-000000000001",
        operatorName: "Стажёр",
        lessonId: "60000000-0000-4000-8000-000000000001",
        lessonTitle: "Занятие",
        occurredAt: "2026-01-03T10:00:00.000Z",
        finalStatus: "completed",
        automaticScore: 80,
        finalScore: 80,
        passThreshold: 75,
        withinNorm: true,
        processErrors: ["late_acknowledgement"],
        coverage: [{ id: "address", label: "Адрес", status: "missing" }],
      }],
    );
    expect(result.cardFields[0]).toMatchObject({
      field: "address", correct: 1, missed: 1, correctedAfterHint: 1,
    });
    expect(result.ddsReferenceItems[0]).toMatchObject({ id: "address", missRate: 100 });
    expect(result.processErrors[0].students[0].count).toBe(1);
    expect(result.heatmap.rows[0].values).toEqual([50]);
  });

  it("names every scenario card field in Russian", () => {
    const withAllFields = attempt("2026-01-01T10:00:00.000Z", true);
    const report = summarizeGroupAnalytics(
      [{
        ...withAllFields,
        analysis: {
          ...withAllFields.analysis,
          fields: INCIDENT_CARD_FIELDS.map((field) => ({ field, matched: true, isRequired: false })),
        },
      }],
      [],
    );

    const untranslated = report.heatmap.fields.filter(({ field, label }) => label === field);
    expect(untranslated).toEqual([]);
  });
});
