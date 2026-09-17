import type { InstructorReport } from "../dto/instructor-report.dto";
import { ReportExporter } from "./report-exporter";

const report: InstructorReport = {
  generatedAt: "2026-09-17T12:00:00.000Z",
  scope: "group",
  target: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Смена А",
  },
  period: {
    from: "2026-09-01T00:00:00.000Z",
    to: "2026-09-17T23:59:59.999Z",
  },
  stats: {
    attempts: 1,
    completedAttempts: 1,
    evaluatedAttempts: 1,
    passedAttempts: 1,
    passRate: 100,
    averageScore: 91,
    bestScore: 91,
    averageAnswerSeconds: 5,
    averageDurationSeconds: 120,
    lastAttemptAt: "2026-09-16T10:00:00.000Z",
  },
  students: [
    {
      operatorId: "00000000-0000-4000-8000-000000000002",
      operatorName: "Анна Оператор",
      email: "anna@example.test",
      serviceTags: ["101"],
      stats: {
        attempts: 1,
        completedAttempts: 1,
        evaluatedAttempts: 1,
        passedAttempts: 1,
        passRate: 100,
        averageScore: 91,
        bestScore: 91,
        averageAnswerSeconds: 5,
        averageDurationSeconds: 120,
        lastAttemptAt: "2026-09-16T10:00:00.000Z",
      },
    },
  ],
  attempts: [
    {
      trainingSessionId: "00000000-0000-4000-8000-000000000003",
      assignmentId: "00000000-0000-4000-8000-000000000004",
      assignmentTitle: "Пожар",
      groupId: "00000000-0000-4000-8000-000000000001",
      groupName: "Смена А",
      operatorId: "00000000-0000-4000-8000-000000000002",
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
      score: 91,
      passThreshold: 75,
      passed: true,
      analysis: {
        status: "ready",
        timelineEvents: 12,
        questionsSatisfied: 5,
        questionsTotal: 5,
        factsRevealed: 6,
        factsTotal: 6,
        criticalQuestionsMissed: 0,
        requiredFieldsMissing: 0,
        incorrectFields: 0,
        incidentCardCompleted: true,
        recommendations: ["Сохранять темп разговора"],
      },
      grammar: { status: "unavailable", message: "Недоступно" },
    },
  ],
  grammar: {
    status: "unavailable",
    message: "Проверка грамматики ещё не входит в main.",
  },
};

describe(ReportExporter.name, () => {
  const exporter = new ReportExporter();

  it("writes UTF-8 CSV with a BOM and a stable attachment name", async () => {
    const artifact = await exporter.export(report, "csv");

    expect(artifact.contentType).toBe("text/csv; charset=utf-8");
    expect(artifact.filename).toBe(
      "instructor-report-group-00000000-2026-09-17.csv",
    );
    expect(artifact.buffer.subarray(0, 3)).toEqual(
      Buffer.from([0xef, 0xbb, 0xbf]),
    );
    expect(artifact.buffer.toString("utf8")).toContain("Анна Оператор");
  });

  it("writes an XLSX workbook", async () => {
    const artifact = await exporter.export(report, "xlsx");

    expect(artifact.contentType).toContain("spreadsheetml");
    expect(artifact.buffer.subarray(0, 2).toString()).toBe("PK");
  });

  it("writes a PDF with an embedded Cyrillic font", async () => {
    const artifact = await exporter.export(report, "pdf");

    expect(artifact.contentType).toBe("application/pdf");
    expect(artifact.buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(artifact.buffer.length).toBeGreaterThan(1_000);
  });
});
