import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";

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
  trainingGroups,
  users,
} from "@/drizzle/schema";
import type { TrainingActor } from "@/modules/training/training.service";

import {
  buildDdsReportTiming,
  detectDdsProcessErrors,
  summarizeDdsLessonReport,
} from "../domain/dds-report-aggregation";
import type { DdsLessonReport, DdsReportCard } from "../dto/dds-report.dto";

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
    const lessons = await this.db
      .select({ lesson: ddsLessons })
      .from(ddsLessons)
      .innerJoin(ddsExercises, eq(ddsExercises.lessonId, ddsLessons.id))
      .where(eq(ddsExercises.operatorId, operatorId))
      .groupBy(ddsLessons.id)
      .orderBy(desc(ddsLessons.startedAt));
    const rows = await Promise.all(
      lessons.map(async ({ lesson }) => {
        const report = await this.buildReport(lesson, operatorId);
        return {
          lessonId: lesson.id,
          title: lesson.title,
          status: lesson.status,
          startedAt: lesson.startedAt.toISOString(),
          finishedAt: lesson.finishedAt?.toISOString() ?? null,
          cards: report.cards.length,
          averageScore: report.summary.averageScore,
          attempts: report.cards.map((card) => ({
            exerciseId: card.exerciseId,
            scenarioCode: card.scenarioCode,
            scenarioTitle: card.scenarioTitle,
            finalStatus: card.finalStatus,
            finalScore: card.finalScore,
          })),
        };
      }),
    );
    return { lessons: rows };
  }

  async myResult(operatorId: string, exerciseId: string) {
    const [row] = await this.db
      .select({ lesson: ddsLessons })
      .from(ddsExercises)
      .innerJoin(ddsLessons, eq(ddsLessons.id, ddsExercises.lessonId))
      .where(
        and(
          eq(ddsExercises.id, exerciseId),
          eq(ddsExercises.operatorId, operatorId),
        ),
      )
      .limit(1);
    if (!row) this.notFound();
    const report = await this.buildReport(row.lesson, operatorId);
    const card = report.cards.find((item) => item.exerciseId === exerciseId);
    if (!card) this.notFound();
    return { lesson: report.lesson, card };
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
      .where(
        and(
          eq(ddsExercises.lessonId, lesson.id),
          operatorId ? eq(ddsExercises.operatorId, operatorId) : undefined,
        ),
      )
      .orderBy(asc(ddsExercises.createdAt));
    const ids = cardRows.map(({ exercise }) => exercise.id);
    const versionIds = cardRows.map(
      ({ exercise }) => exercise.scenarioVersionId,
    );
    const [events, evaluations, reviews, references, insightsRows] =
      await Promise.all([
        ids.length
          ? this.db
              .select()
              .from(ddsExerciseEvents)
              .where(inArray(ddsExerciseEvents.exerciseId, ids))
              .orderBy(asc(ddsExerciseEvents.sequence))
          : [],
        ids.length
          ? this.db
              .select()
              .from(ddsTextEvaluations)
              .where(inArray(ddsTextEvaluations.exerciseId, ids))
          : [],
        ids.length
          ? this.db
              .select()
              .from(ddsExerciseReviews)
              .where(inArray(ddsExerciseReviews.exerciseId, ids))
              .orderBy(desc(ddsExerciseReviews.createdAt))
          : [],
        ids.length
          ? this.db
              .select()
              .from(ddsCardReferences)
              .where(
                or(
                  inArray(ddsCardReferences.exerciseId, ids),
                  inArray(ddsCardReferences.scenarioVersionId, versionIds),
                ),
              )
          : [],
        this.db
          .select()
          .from(ddsLessonInsights)
          .where(eq(ddsLessonInsights.lessonId, lesson.id))
          .limit(1),
      ]);
    const cards: DdsReportCard[] = cardRows.map(
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
          reactionNormSeconds: lesson.acknowledgementNormSeconds,
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

  private notFound(): never {
    throw new AppNotFoundException(
      ErrorCodes.DDS_REPORT_NOT_FOUND,
      "Отчёт ДДС недоступен",
    );
  }
}
