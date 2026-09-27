import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNotNull, or } from "drizzle-orm";

import { AppNotFoundException } from "@/common/exceptions/app.exception";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import { ErrorCodes, GrammarReportSchema } from "@/contracts";
import {
  ddsCardReferences,
  ddsExerciseEvents,
  ddsExerciseReviews,
  ddsExercises,
  ddsLessonInsights,
  ddsLessons,
  ddsTextEvaluations,
  scenarios,
  scenarioVersions,
  trainingAssignments,
  trainingAttempts,
  trainingGroups,
  users,
} from "@/drizzle/schema";
import type { TrainingActor } from "@/modules/training/application/training.service";

import {
  buildDdsReportTiming,
  detectDdsProcessErrors,
  summarizeDdsLessonReport,
} from "../domain/dds-report-aggregation";
import type { DdsLessonReport, DdsReportCard } from "../dto/dds-report.dto";

type OperatorResultRow = {
  exercise: typeof ddsExercises.$inferSelect;
  lesson: typeof ddsLessons.$inferSelect | null;
  assignment: typeof trainingAssignments.$inferSelect | null;
};

type OperatorResultContext = {
  id: string;
  title: string;
  status: "active" | "finished";
  startedAt: string;
  finishedAt: string | null;
};

@Injectable()
export class DdsReportService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService["db"]) {}

  async lessonReport(
    actor: TrainingActor,
    lessonId: string,
  ): Promise<DdsLessonReport> {
    const lesson = await this.managedLesson(actor, lessonId);
    return this.buildReport(lesson);
  }

  async myResults(operatorId: string) {
    const sources = await this.operatorResultRows(operatorId);
    const norms = new Map(
      sources.map((row) => [row.exercise.id, this.reactionNorm(row)]),
    );
    const cards = await this.buildCards(
      sources.map(({ exercise }) => exercise.id),
      norms,
    );
    const cardsById = new Map(cards.map((card) => [card.exerciseId, card]));
    const groups = new Map<
      string,
      { context: OperatorResultContext; cards: DdsReportCard[] }
    >();

    for (const source of sources) {
      const card = cardsById.get(source.exercise.id);
      if (!card) continue;
      const context = this.resultContext(source);
      const group = groups.get(context.id) ?? { context, cards: [] };
      group.cards.push(card);
      groups.set(context.id, group);
    }

    return {
      lessons: [...groups.values()].map(({ context, cards: resultCards }) => {
        const summary = summarizeDdsLessonReport(
          resultCards.map((card) => ({
            score: card.finalScore,
            timing: card.timing,
            processErrors: card.processErrors,
            finalStatus: card.finalStatus,
          })),
        );
        return {
          lessonId: context.id,
          title: context.title,
          status: context.status,
          startedAt: context.startedAt,
          finishedAt: context.finishedAt,
          cards: resultCards.length,
          averageScore: summary.averageScore,
          attempts: resultCards.map((card) => ({
            exerciseId: card.exerciseId,
            scenarioCode: card.scenarioCode,
            scenarioTitle: card.scenarioTitle,
            finalStatus: card.finalStatus,
            finalScore: card.finalScore,
          })),
        };
      }),
    };
  }

  async myResult(operatorId: string, exerciseId: string) {
    const [row] = await this.operatorResultRows(operatorId, exerciseId);
    if (!row) this.notFound();
    const context = this.resultContext(row);
    const [card] = await this.buildCards(
      [row.exercise.id],
      new Map([[row.exercise.id, this.reactionNorm(row)]]),
    );
    if (!card) this.notFound();
    return {
      lesson: {
        id: context.id,
        title: context.title,
        status: context.status,
        startedAt: context.startedAt,
        finishedAt: context.finishedAt,
        acknowledgementNormSeconds: this.reactionNorm(row),
        passThreshold: row.exercise.passThreshold,
      },
      card,
    };
  }

  private operatorResultRows(
    operatorId: string,
    exerciseId?: string,
  ): Promise<OperatorResultRow[]> {
    return this.db
      .select({
        exercise: ddsExercises,
        lesson: ddsLessons,
        assignment: trainingAssignments,
      })
      .from(ddsExercises)
      .leftJoin(ddsLessons, eq(ddsLessons.id, ddsExercises.lessonId))
      .leftJoin(
        trainingAttempts,
        eq(trainingAttempts.id, ddsExercises.trainingAttemptId),
      )
      .leftJoin(
        trainingAssignments,
        eq(trainingAssignments.id, trainingAttempts.assignmentId),
      )
      .where(
        and(
          eq(ddsExercises.operatorId, operatorId),
          isNotNull(ddsExercises.completedAt),
          exerciseId ? eq(ddsExercises.id, exerciseId) : undefined,
        ),
      )
      .orderBy(desc(ddsExercises.completedAt));
  }

  private resultContext(row: OperatorResultRow): OperatorResultContext {
    if (row.lesson) {
      return {
        id: row.lesson.id,
        title: row.lesson.title,
        status: row.lesson.status,
        startedAt: row.lesson.startedAt.toISOString(),
        finishedAt: row.lesson.finishedAt?.toISOString() ?? null,
      };
    }
    return {
      id: row.assignment?.id ?? row.exercise.id,
      title: row.assignment?.title ?? "Самостоятельная карточка ДДС",
      status: "finished" as const,
      startedAt: row.exercise.createdAt.toISOString(),
      finishedAt: row.exercise.completedAt?.toISOString() ?? null,
    };
  }

  private reactionNorm(row: OperatorResultRow): number {
    return (
      row.lesson?.acknowledgementNormSeconds ??
      row.assignment?.answerNormSeconds ??
      Math.max(
        1,
        Math.round(
          (row.exercise.acknowledgementDeadlineAt.getTime() -
            row.exercise.createdAt.getTime()) /
            1_000,
        ),
      )
    );
  }

  /** Обезличенная часть отчёта, которую допустимо передавать модели. */
  async insightsInput(lessonId: string) {
    const [lesson] = await this.db
      .select()
      .from(ddsLessons)
      .where(eq(ddsLessons.id, lessonId))
      .limit(1);
    if (!lesson) this.notFound();
    const report = await this.buildReport(lesson);
    return {
      summary: report.summary,
      errors: report.summary.topErrors,
      examples: report.cards.slice(0, 12).map((card) => ({
        scenarioCode: card.scenarioCode,
        processErrors: card.processErrors,
        missingItems: card.coverage
          .filter(({ status }) => status === "missing")
          .map(({ label }) => label),
        contradictions: card.contradictions.map(
          ({ description }) => description,
        ),
      })),
      scenarioCodes: [
        ...new Set(report.cards.map(({ scenarioCode }) => scenarioCode)),
      ],
    };
  }

  private async managedLesson(actor: TrainingActor, lessonId: string) {
    const [row] = await this.db
      .select({ lesson: ddsLessons })
      .from(ddsLessons)
      .leftJoin(trainingGroups, eq(trainingGroups.id, ddsLessons.groupId))
      .where(
        and(
          eq(ddsLessons.id, lessonId),
          actor.role === "admin"
            ? undefined
            : or(
                eq(ddsLessons.createdBy, actor.id),
                eq(trainingGroups.instructorId, actor.id),
              ),
        ),
      )
      .limit(1);
    if (!row || row.lesson.status !== "finished") this.notFound();
    return row.lesson;
  }

  private async buildReport(
    lesson: typeof ddsLessons.$inferSelect,
    operatorId?: string,
  ): Promise<DdsLessonReport> {
    const exerciseRows = await this.db
      .select({ id: ddsExercises.id })
      .from(ddsExercises)
      .where(
        and(
          eq(ddsExercises.lessonId, lesson.id),
          operatorId ? eq(ddsExercises.operatorId, operatorId) : undefined,
        ),
      )
      .orderBy(asc(ddsExercises.createdAt));
    const ids = exerciseRows.map(({ id }) => id);
    const cards = await this.buildCards(
      ids,
      new Map(ids.map((id) => [id, lesson.acknowledgementNormSeconds])),
    );
    const insightsRows = await this.db
      .select()
      .from(ddsLessonInsights)
      .where(eq(ddsLessonInsights.lessonId, lesson.id))
      .limit(1);
    const summary = summarizeDdsLessonReport(
      cards.map((card) => ({
        score: card.finalScore,
        timing: card.timing,
        processErrors: card.processErrors,
        finalStatus: card.finalStatus,
      })),
    );
    const byStudent = new Map<string, DdsReportCard[]>();
    for (const card of cards) {
      const rows = byStudent.get(card.operatorId) ?? [];
      rows.push(card);
      byStudent.set(card.operatorId, rows);
    }
    const insights = insightsRows[0];
    return {
      lesson: {
        id: lesson.id,
        title: lesson.title,
        status: lesson.status,
        startedAt: lesson.startedAt.toISOString(),
        finishedAt: lesson.finishedAt?.toISOString() ?? null,
        acknowledgementNormSeconds: lesson.acknowledgementNormSeconds,
        passThreshold: lesson.passThreshold,
      },
      summary,
      students: [...byStudent.entries()].map(([id, studentCards]) => {
        const studentSummary = summarizeDdsLessonReport(
          studentCards.map((card) => ({
            score: card.finalScore,
            timing: card.timing,
            processErrors: card.processErrors,
            finalStatus: card.finalStatus,
          })),
        );
        return {
          operatorId: id,
          operatorName: studentCards[0]!.operatorName,
          cards: studentCards.length,
          averageScore: studentSummary.averageScore,
          minScore: studentSummary.minScore,
          maxScore: studentSummary.maxScore,
        };
      }),
      cards,
      insights: insights
        ? {
            status: insights.status,
            strengths: insights.strengths,
            weaknesses: insights.weaknesses,
            recommendations: insights.recommendations,
            focusScenarios: insights.focusScenarios,
            error: insights.error,
          }
        : null,
    };
  }

  private async buildCards(
    exerciseIds: readonly string[],
    reactionNorms: ReadonlyMap<string, number>,
  ): Promise<DdsReportCard[]> {
    if (exerciseIds.length === 0) return [];
    const cardRows = await this.db
      .select({
        exercise: ddsExercises,
        operatorName: users.fullName,
        scenarioCode: scenarios.code,
        scenarioTitle: scenarios.title,
      })
      .from(ddsExercises)
      .innerJoin(users, eq(users.id, ddsExercises.operatorId))
      .innerJoin(
        scenarioVersions,
        eq(scenarioVersions.id, ddsExercises.scenarioVersionId),
      )
      .innerJoin(scenarios, eq(scenarios.id, scenarioVersions.scenarioId))
      .where(inArray(ddsExercises.id, [...exerciseIds]))
      .orderBy(asc(ddsExercises.createdAt));
    if (cardRows.length === 0) return [];
    const ids = cardRows.map(({ exercise }) => exercise.id);
    const versionIds = cardRows.map(
      ({ exercise }) => exercise.scenarioVersionId,
    );
    const [events, evaluations, reviews, references] = await Promise.all([
      this.db
        .select()
        .from(ddsExerciseEvents)
        .where(inArray(ddsExerciseEvents.exerciseId, ids))
        .orderBy(asc(ddsExerciseEvents.sequence)),
      this.db
        .select()
        .from(ddsTextEvaluations)
        .where(inArray(ddsTextEvaluations.exerciseId, ids)),
      this.db
        .select()
        .from(ddsExerciseReviews)
        .where(inArray(ddsExerciseReviews.exerciseId, ids))
        .orderBy(desc(ddsExerciseReviews.createdAt)),
      this.db
        .select()
        .from(ddsCardReferences)
        .where(
          or(
            inArray(ddsCardReferences.exerciseId, ids),
            inArray(ddsCardReferences.scenarioVersionId, versionIds),
          ),
        ),
    ]);
    return cardRows.map(
      ({ exercise, operatorName, scenarioCode, scenarioTitle }) => {
        const timelineRows = events.filter(
          ({ exerciseId }) => exerciseId === exercise.id,
        );
        const evaluation = evaluations.find(
          ({ exerciseId }) => exerciseId === exercise.id,
        );
        const review = reviews.find(
          ({ exerciseId }) => exerciseId === exercise.id,
        );
        // Эталон конкретной карточки очереди важнее общего эталона версии сценария.
        const reference =
          references.find((item) => item.exerciseId === exercise.id) ??
          references.find(
            (item) =>
              item.exerciseId === null &&
              item.scenarioVersionId === exercise.scenarioVersionId,
          );
        const accepted = timelineRows.find(
          ({ toStatus }) => toStatus === "accepted",
        );
        const timing = buildDdsReportTiming({
          createdAt: exercise.createdAt,
          acceptedAt: accepted?.occurredAt ?? null,
          completedAt: exercise.completedAt,
          reactionNormSeconds: reactionNorms.get(exercise.id) ?? 30,
        });
        const expectedOutcome = reference?.expectedOutcome ?? null;
        const processErrors = detectDdsProcessErrors({
          terminalStatus: exercise.status,
          expectedOutcome,
          timing,
        });
        const outcomeMatched =
          expectedOutcome === null
            ? null
            : expectedOutcome === "accept"
              ? exercise.status === "completed"
              : exercise.status === "refused";
        return {
          exerciseId: exercise.id,
          operatorId: exercise.operatorId!,
          operatorName,
          scenarioVersionId: exercise.scenarioVersionId,
          scenarioCode,
          scenarioTitle,
          finalStatus: exercise.status,
          expectedOutcome,
          outcomeMatched,
          timeline: timelineRows.map((event, index) => ({
            sequence: event.sequence,
            status: event.toStatus,
            comment: event.comment,
            occurredAt: event.occurredAt.toISOString(),
            elapsedSeconds:
              index === 0
                ? 0
                : Math.max(
                    0,
                    Math.round(
                      (event.occurredAt.getTime() -
                        timelineRows[index - 1]!.occurredAt.getTime()) /
                        1_000,
                    ),
                  ),
          })),
          timing,
          processErrors,
          coverage: evaluation?.coverage ?? [],
          contradictions: evaluation?.contradictions ?? [],
          grammar: GrammarReportSchema.nullable().parse(
            evaluation?.grammar ?? null,
          ),
          automaticScore: exercise.score,
          instructorReview: review
            ? { score: review.score, comment: review.comment }
            : null,
          finalScore: review?.score ?? exercise.score,
        };
      },
    );
  }

  private notFound(): never {
    throw new AppNotFoundException(
      ErrorCodes.DDS_REPORT_NOT_FOUND,
      "Отчёт ДДС недоступен",
    );
  }
}
