import { Injectable } from "@nestjs/common";

import {
  AppBadRequestException,
  AppNotFoundException,
} from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";
import { AuditLogService } from "@/modules/audit-log/audit-log.service";
import { DebriefService } from "@/modules/debrief/application/debrief.service";
import type { Debrief } from "@/modules/debrief/dto/debrief.dto";
import type { InstructorCallView } from "@/modules/training/dto/training.dto";
import {
  type TrainingActor,
  TrainingService,
} from "@/modules/training/training.service";

import {
  type InstructorReport,
  type InstructorReportAttempt,
  type InstructorReportExportQuery,
  type InstructorReportQuery,
} from "../dto/instructor-report.dto";
import {
  summarizeReportAttempts,
  summarizeReportStudents,
  type ReportStudentIdentity,
} from "../domain/report-aggregation";
import {
  type ReportArtifact,
  ReportExporter,
} from "../infrastructure/report-exporter";

const MAX_REPORT_ATTEMPTS = 500;
const DEBRIEF_CONCURRENCY = 6;
const GRAMMAR_UNAVAILABLE = {
  status: "unavailable" as const,
  message:
    "Проверка грамматики ещё не входит в main и не учитывается в отчёте.",
};

interface ReportTarget {
  id: string;
  name: string;
  students: ReportStudentIdentity[];
}

@Injectable()
export class InstructorReportService {
  constructor(
    private readonly training: TrainingService,
    private readonly debrief: DebriefService,
    private readonly exporter: ReportExporter,
    private readonly audit: AuditLogService,
  ) {}

  async getReport(
    actor: TrainingActor,
    query: InstructorReportQuery,
  ): Promise<InstructorReport> {
    const period = this.period(query);
    const target = await this.target(actor, query);
    const calls = await this.training.listInstructorCalls(actor, {
      groupId: query.scope === "group" ? query.groupId : undefined,
      operatorId: query.scope === "student" ? query.operatorId : undefined,
      from: period.from ?? undefined,
      to: period.to ?? undefined,
      everyCall: true,
      limit: MAX_REPORT_ATTEMPTS + 1,
    });

    if (
      query.scope === "student" &&
      actor.role === "instructor" &&
      target.students[0]?.serviceTags.length === 0 &&
      calls.length === 0
    ) {
      // Не раскрываем преподавателю существование ученика, которым он не
      // управляет и по которому у него нет собственных назначений.
      throw new AppNotFoundException(
        ErrorCodes.AUTH_USER_NOT_FOUND,
        "The student is outside the instructor scope",
      );
    }
    if (calls.length > MAX_REPORT_ATTEMPTS) {
      throw new AppBadRequestException(
        ErrorCodes.REPORT_TOO_LARGE,
        `The report contains more than ${MAX_REPORT_ATTEMPTS} attempts; narrow the date range`,
      );
    }

    const attempts = await this.attempts(calls);
    return {
      generatedAt: new Date().toISOString(),
      scope: query.scope,
      target: { id: target.id, name: target.name },
      period: {
        from: period.from?.toISOString() ?? null,
        to: period.to?.toISOString() ?? null,
      },
      stats: summarizeReportAttempts(attempts),
      students: summarizeReportStudents(target.students, attempts),
      attempts,
      grammar: GRAMMAR_UNAVAILABLE,
    };
  }

  async export(
    actor: TrainingActor,
    input: InstructorReportExportQuery,
  ): Promise<ReportArtifact> {
    const query: InstructorReportQuery =
      input.scope === "group"
        ? {
            scope: "group",
            groupId: input.groupId,
            from: input.from,
            to: input.to,
          }
        : {
            scope: "student",
            operatorId: input.operatorId,
            from: input.from,
            to: input.to,
          };
    const report = await this.getReport(actor, query);
    const artifact = await this.exporter.export(report, input.format);

    await this.audit.log({
      actorId: actor.id,
      action: "instructor.report.exported",
      resource: "instructor_report",
      resourceId: report.target.id,
      details: {
        scope: report.scope,
        format: input.format,
        from: report.period.from,
        to: report.period.to,
        attempts: report.stats.attempts,
      },
    });

    return artifact;
  }

  private period(query: InstructorReportQuery): {
    from: Date | null;
    to: Date | null;
  } {
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if (from !== null && to !== null && from > to) {
      throw new AppBadRequestException(
        ErrorCodes.REPORT_INVALID_PERIOD,
        "Report period start must not be after its end",
      );
    }
    return { from, to };
  }

  private async target(
    actor: TrainingActor,
    query: InstructorReportQuery,
  ): Promise<ReportTarget> {
    if (query.scope === "group") {
      if (query.groupId === undefined) {
        throw new AppBadRequestException(
          ErrorCodes.VALIDATION_FAILED,
          "A group report requires groupId",
        );
      }
      const group = await this.training.getGroup(actor, query.groupId);
      return {
        id: group.id,
        name: group.name,
        students: group.members.map((member) => ({
          id: member.userId,
          fullName: member.fullName,
          email: member.email,
          serviceTags: [member.serviceTag],
        })),
      };
    }

    if (query.operatorId === undefined) {
      throw new AppBadRequestException(
        ErrorCodes.VALIDATION_FAILED,
        "A student report requires operatorId",
      );
    }
    const student = await this.training.requireManagedStudent(
      actor,
      query.operatorId,
    );
    return {
      id: student.id,
      name: student.fullName,
      students: [
        {
          id: student.id,
          fullName: student.fullName,
          email: student.email,
          serviceTags: student.groups.map(({ serviceTag }) => serviceTag),
        },
      ],
    };
  }

  private async attempts(
    calls: readonly InstructorCallView[],
  ): Promise<InstructorReportAttempt[]> {
    const result: InstructorReportAttempt[] = [];
    for (let index = 0; index < calls.length; index += DEBRIEF_CONCURRENCY) {
      const batch = calls.slice(index, index + DEBRIEF_CONCURRENCY);
      result.push(
        ...(await Promise.all(batch.map((call) => this.attempt(call)))),
      );
    }
    return result;
  }

  private async attempt(
    call: InstructorCallView,
  ): Promise<InstructorReportAttempt> {
    const fallbackAnswerSeconds =
      call.answeredAt === null
        ? null
        : Math.max(
            0,
            Math.round(
              (Date.parse(call.answeredAt) - Date.parse(call.offeredAt)) /
                1_000,
            ),
          );
    let debrief: Debrief | null = null;
    let analysisStatus: "ready" | "pending" | "unavailable" =
      call.stage === "ended" ? "unavailable" : "pending";

    if (call.stage === "ended") {
      try {
        debrief = await this.debrief.get(
          call.trainingSessionId,
          call.operatorId,
        );
        analysisStatus = "ready";
      } catch {
        // Отчёт должен остаться доступным, даже если один старый разбор
        // повреждён. Строка явно показывает, что детальный анализ недоступен.
      }
    }

    const evaluation = debrief?.evaluation ?? null;
    const score = evaluation?.score ?? call.score;
    const answerSeconds =
      debrief?.timings.answerSeconds ?? fallbackAnswerSeconds;
    const questions = debrief?.questions ?? [];
    const fields = evaluation?.fields ?? [];

    return {
      trainingSessionId: call.trainingSessionId,
      assignmentId: call.assignmentId,
      assignmentTitle: call.assignmentTitle,
      groupId: call.groupId,
      groupName: call.groupName,
      operatorId: call.operatorId,
      operatorName: call.operatorName,
      scenarioCode: call.scenarioCode,
      scenarioTitle: call.title,
      attemptNumber: call.attemptNumber,
      status: call.attemptStatus,
      offeredAt: call.offeredAt,
      answeredAt: call.answeredAt,
      endedAt: call.endedAt,
      answerSeconds,
      answerNormSeconds:
        debrief?.timings.answerNormSeconds ?? call.answerNormSeconds,
      answeredWithinNorm:
        answerSeconds === null
          ? null
          : answerSeconds <=
            (debrief?.timings.answerNormSeconds ?? call.answerNormSeconds),
      durationSeconds: debrief?.timings.durationSeconds ?? call.durationSeconds,
      expectedDurationSeconds: debrief?.timings.expectedDurationSeconds ?? null,
      score,
      passThreshold: evaluation?.passThreshold ?? call.passThreshold,
      passed:
        score === null
          ? null
          : score >= (evaluation?.passThreshold ?? call.passThreshold),
      analysis: {
        status: analysisStatus,
        timelineEvents: debrief?.timeline.length ?? null,
        questionsSatisfied:
          debrief === null
            ? null
            : questions.filter(({ satisfied }) => satisfied).length,
        questionsTotal: debrief === null ? null : questions.length,
        factsRevealed:
          debrief === null
            ? null
            : debrief.facts.filter(({ revealed }) => revealed).length,
        factsTotal: debrief === null ? null : debrief.facts.length,
        criticalQuestionsMissed:
          debrief === null
            ? null
            : questions.filter(
                ({ isCritical, satisfied }) => isCritical && !satisfied,
              ).length,
        requiredFieldsMissing:
          evaluation === null
            ? null
            : fields.filter(
                ({ actual, isRequired }) =>
                  isRequired && (actual === null || actual.trim() === ""),
              ).length,
        incorrectFields:
          evaluation === null
            ? null
            : fields.filter(
                ({ actual, matched }) =>
                  actual !== null && actual.trim() !== "" && !matched,
              ).length,
        incidentCardCompleted:
          debrief === null ? null : debrief.incidentCard !== null,
        recommendations: evaluation?.recommendations ?? [],
      },
      grammar: GRAMMAR_UNAVAILABLE,
    };
  }
}
