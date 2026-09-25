import type { AppException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";
import type { AuditLogService } from "@/modules/audit-log/application/audit-log.service";
import type { DebriefService } from "@/modules/debrief/application/debrief.service";
import type { TrainingService } from "@/modules/training/application/training.service";

import type { ReportExporter } from "../infrastructure/report-exporter";
import { InstructorReportService } from "./instructor-report.service";

const actor = { id: "instructor-1", role: "instructor" } as const;
const groupId = "00000000-0000-4000-8000-000000000001";
const operatorId = "00000000-0000-4000-8000-000000000002";
const sessionId = "00000000-0000-4000-8000-000000000003";
const assignmentId = "00000000-0000-4000-8000-000000000004";

const createService = () => {
  const training = {
    getGroup: jest.fn().mockResolvedValue({
      id: groupId,
      name: "Смена А",
      members: [
        {
          userId: operatorId,
          fullName: "Анна Оператор",
          email: "anna@example.test",
          serviceTag: "101",
        },
      ],
    }),
    requireManagedStudent: jest.fn(),
    listInstructorCalls: jest.fn().mockResolvedValue([
      {
        trainingSessionId: sessionId,
        assignmentId,
        assignmentTitle: "Пожар",
        groupId,
        groupName: "Смена А",
        operatorId,
        operatorName: "Анна Оператор",
        scenarioCode: "FIRE-01",
        title: "Пожар в квартире",
        stage: "ended",
        offeredAt: "2026-09-16T10:00:00.000Z",
        answeredAt: "2026-09-16T10:00:05.000Z",
        endedAt: "2026-09-16T10:02:05.000Z",
        durationSeconds: 120,
        attemptNumber: 1,
        attemptStatus: "completed",
        answerNormSeconds: 30,
        passThreshold: 75,
        score: null,
      },
    ]),
  };
  const debrief = {
    get: jest.fn().mockResolvedValue({
      timings: {
        answerSeconds: 5,
        answerNormSeconds: 30,
        durationSeconds: 120,
        expectedDurationSeconds: 180,
      },
      timeline: [{ sequence: 1 }],
      questions: [
        { isCritical: true, satisfied: false },
        { isCritical: false, satisfied: true },
      ],
      facts: [{ revealed: true }, { revealed: false }],
      incidentCard: { id: "card-1" },
      evaluation: {
        score: 82,
        passThreshold: 75,
        fields: [
          { actual: null, isRequired: true, matched: false },
          { actual: "ошибка", isRequired: true, matched: false },
        ],
        recommendations: ["Уточнить адрес"],
      },
    }),
  };
  const exporter = {
    export: jest.fn().mockResolvedValue({
      buffer: Buffer.from("report"),
      contentType: "text/csv",
      filename: "report.csv",
    }),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };

  const service = new InstructorReportService(
    training as unknown as TrainingService,
    debrief as unknown as DebriefService,
    exporter as unknown as ReportExporter,
    audit as unknown as AuditLogService,
  );
  return { service, training, debrief, exporter, audit };
};

const rejection = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as AppException;
  }
  throw new Error("Expected rejection");
};

describe(InstructorReportService.name, () => {
  it("builds a scoped group report with timings and evaluation errors", async () => {
    const { service, training, debrief } = createService();
    const report = await service.getReport(actor, {
      scope: "group",
      groupId,
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-30T23:59:59.999Z",
    });

    expect(training.getGroup).toHaveBeenCalledWith(actor, groupId);
    expect(training.listInstructorCalls).toHaveBeenCalledWith(actor, {
      groupId,
      operatorId: undefined,
      from: new Date("2026-09-01T00:00:00.000Z"),
      to: new Date("2026-09-30T23:59:59.999Z"),
      everyCall: true,
      limit: 501,
    });
    expect(debrief.get).toHaveBeenCalledWith(sessionId, operatorId);
    expect(report.stats).toMatchObject({
      attempts: 1,
      evaluatedAttempts: 1,
      passedAttempts: 1,
      averageScore: 82,
    });
    expect(report.attempts[0]).toMatchObject({
      answeredWithinNorm: true,
      score: 82,
      passed: true,
      analysis: {
        criticalQuestionsMissed: 1,
        requiredFieldsMissing: 1,
        incorrectFields: 1,
        recommendations: ["Уточнить адрес"],
      },
      grammar: { status: "unavailable" },
    });
  });

  it("rejects an inverted period with a stable API code", async () => {
    const { service, training } = createService();
    const error = await rejection(
      service.getReport(actor, {
        scope: "group",
        groupId,
        from: "2026-09-30T00:00:00.000Z",
        to: "2026-09-01T00:00:00.000Z",
      }),
    );

    expect(error.code).toBe(ErrorCodes.REPORT_INVALID_PERIOD);
    expect(training.getGroup).not.toHaveBeenCalled();
  });

  it("exports the exact report snapshot and audits only metadata", async () => {
    const { service, exporter, audit } = createService();
    await service.export(actor, { scope: "group", groupId, format: "csv" });

    expect(exporter.export).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "group",
        target: { id: groupId, name: "Смена А" },
      }),
      "csv",
    );
    expect(audit.log).toHaveBeenCalledWith({
      actorId: actor.id,
      action: "instructor.report.exported",
      resource: "instructor_report",
      resourceId: groupId,
      details: {
        scope: "group",
        format: "csv",
        from: null,
        to: null,
        attempts: 1,
      },
    });
  });
});
