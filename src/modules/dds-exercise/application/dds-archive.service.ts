import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { AppBadRequestException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import { ddsExercises, ddsLessons, users } from "@/drizzle/schema";
import type { TrainingActor } from "@/modules/training/training.service";

import {
  archiveOwner,
  archivePeriod,
  likePattern,
} from "../domain/dds-archive-query";
import type {
  DdsArchiveItem,
  DdsArchivePage,
  DdsArchiveQuery,
} from "../dto/dds-archive.dto";

/** Поля карточки, по которым идёт поиск словами. */
const SEARCHABLE_CARD_FIELDS = [
  "scenarioCode",
  "title",
  "incidentType",
  "addressText",
  "description",
  "summary",
] as const;

/**
 * Архив разобранных карточек.
 *
 * Список «мои упражнения» отвечает на вопрос «что мне сейчас делать», а разбор
 * происшествия задним числом — на другой: найти карточку по адресу, типу
 * происшествия или дате, когда ни номера, ни занятия уже не помнят. Поэтому
 * архив живёт отдельно от очереди и умеет искать, а не только перечислять.
 */
@Injectable()
export class DdsArchiveService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: DrizzleService["db"],
  ) {}

  async search(
    actor: TrainingActor,
    query: DdsArchiveQuery,
  ): Promise<DdsArchivePage> {
    const filter = this.conditions(actor, query);

    const rows = await this.db
      .select({
        id: ddsExercises.id,
        createdAt: ddsExercises.createdAt,
        completedAt: ddsExercises.completedAt,
        status: ddsExercises.status,
        addressedService: ddsExercises.addressedService,
        score: ddsExercises.score,
        passed: ddsExercises.passed,
        card: ddsExercises.card,
        operatorId: users.id,
        operatorName: users.fullName,
        lessonId: ddsLessons.id,
        lessonTitle: ddsLessons.title,
      })
      .from(ddsExercises)
      .leftJoin(users, eq(users.id, ddsExercises.operatorId))
      .leftJoin(ddsLessons, eq(ddsLessons.id, ddsExercises.lessonId))
      .where(filter)
      // Свежая карточка сверху: архив читают от последнего происшествия назад.
      .orderBy(desc(ddsExercises.createdAt), desc(ddsExercises.id))
      .limit(query.limit)
      .offset(query.offset);

    const [totals] = await this.db
      .select({ total: count() })
      .from(ddsExercises)
      .leftJoin(users, eq(users.id, ddsExercises.operatorId))
      .leftJoin(ddsLessons, eq(ddsLessons.id, ddsExercises.lessonId))
      .where(filter);

    return {
      items: rows.map((row): DdsArchiveItem => {
        const { card } = row;
        return {
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          completedAt: row.completedAt?.toISOString() ?? null,
          status: row.status,
          addressedService: row.addressedService,
          score: row.score ?? null,
          passed: row.passed ?? null,
          operator:
            row.operatorId && row.operatorName
              ? { id: row.operatorId, fullName: row.operatorName }
              : null,
          lesson:
            row.lessonId && row.lessonTitle
              ? { id: row.lessonId, title: row.lessonTitle }
              : null,
          scenarioCode: card.scenarioCode,
          title: card.title,
          category: card.category,
          incidentType: card.incidentType,
          addressText: card.addressText,
        };
      }),
      total: totals?.total ?? 0,
      limit: query.limit,
      offset: query.offset,
    };
  }

  private conditions(
    actor: TrainingActor,
    query: DdsArchiveQuery,
  ): SQL | undefined {
    const owner = archiveOwner(actor.role, actor.id, query.operatorId);
    const period = this.period(query);
    const search = query.search ? likePattern(query.search) : null;

    const conditions: SQL[] = [
      ...(owner ? [eq(ddsExercises.operatorId, owner)] : []),
      ...(query.status ? [eq(ddsExercises.status, query.status)] : []),
      ...(query.service
        ? [eq(ddsExercises.addressedService, query.service)]
        : []),
      ...(query.lessonId ? [eq(ddsExercises.lessonId, query.lessonId)] : []),
      ...(query.category
        ? [sql`${ddsExercises.card} ->> 'category' = ${query.category}`]
        : []),
      ...(period.since ? [gte(ddsExercises.createdAt, period.since)] : []),
      ...(period.until ? [lt(ddsExercises.createdAt, period.until)] : []),
      ...this.outcome(query),
      ...(search ? [this.cardMatches(search)] : []),
    ];

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  private period(query: DdsArchiveQuery) {
    try {
      return archivePeriod(query.from, query.to);
    } catch {
      throw new AppBadRequestException(
        ErrorCodes.REPORT_INVALID_PERIOD,
        "The archive period ends before it starts",
      );
    }
  }

  /**
   * Незавершённая карточка отличается от проваленной.
   *
   * Занятие могли закончить раньше, чем диспетчер довёл карточку до конца:
   * такая попытка не оценена, и складывать её с провалами нельзя.
   */
  private outcome(query: DdsArchiveQuery): SQL[] {
    if (query.outcome === "passed") return [eq(ddsExercises.passed, true)];
    if (query.outcome === "failed") return [eq(ddsExercises.passed, false)];
    if (query.outcome === "unfinished") return [isNull(ddsExercises.passed)];
    return [];
  }

  /** Слово ищется сразу во всех текстовых полях снимка карточки. */
  private cardMatches(pattern: string): SQL {
    const matches = SEARCHABLE_CARD_FIELDS.map(
      (field) =>
        sql`${ddsExercises.card} ->> ${field} ilike ${pattern}` satisfies SQL,
    );

    return or(...matches) as SQL;
  }
}
