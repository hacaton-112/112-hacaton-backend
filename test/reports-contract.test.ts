import { describe, expect, test } from "bun:test";

import { InstructorReportSchema } from "../src/contracts/reports";
import {
  filenameFromContentDisposition,
  reportRequestParams,
} from "../src/services/report-download";

const groupId = "0f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f01";
const operatorId = "0f6f1d68-2b0e-4bd9-8f2f-6f1f0f0f0f02";

describe("instructor report contract", () => {
  test("serializes group and student filters without leaking the other target", () => {
    expect(
      reportRequestParams(
        {
          scope: "group",
          groupId,
          from: "2026-09-01T00:00:00.000Z",
        },
        "xlsx",
      ),
    ).toEqual({
      scope: "group",
      groupId,
      from: "2026-09-01T00:00:00.000Z",
      format: "xlsx",
    });
    expect(reportRequestParams({ scope: "student", operatorId })).toEqual({
      scope: "student",
      operatorId,
    });
  });

  test("uses the backend attachment filename and removes path separators", () => {
    expect(
      filenameFromContentDisposition(
        'attachment; filename="instructor-report-group-01.pdf"',
      ),
    ).toBe("instructor-report-group-01.pdf");
    expect(
      filenameFromContentDisposition(
        "attachment; filename*=UTF-8''%D0%BE%D1%82%D1%87%D1%91%D1%82.xlsx",
      ),
    ).toBe("отчёт.xlsx");
    expect(
      filenameFromContentDisposition('attachment; filename="../report.csv"'),
    ).toBe(".._report.csv");
  });

  test("validates summary, attempts and explicit grammar availability", () => {
    const report = InstructorReportSchema.parse({
      generatedAt: "2026-09-17T12:00:00.000Z",
      scope: "student",
      target: { id: operatorId, name: "Анна Оператор" },
      period: { from: null, to: null },
      stats: {
        attempts: 0,
        completedAttempts: 0,
        evaluatedAttempts: 0,
        passedAttempts: 0,
        passRate: null,
        averageScore: null,
        bestScore: null,
        averageAnswerSeconds: null,
        averageDurationSeconds: null,
        lastAttemptAt: null,
      },
      students: [],
      attempts: [],
      grammar: {
        status: "unavailable",
        message: "Проверка грамматики ещё не входит в main.",
      },
    });

    expect(report.grammar.status).toBe("unavailable");
    expect(report.stats.attempts).toBe(0);
  });
});
