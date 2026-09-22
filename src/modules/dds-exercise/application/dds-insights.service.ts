import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, asc, count, eq, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { AppBadRequestException } from "@/common/exceptions/app.exception";
import { generateId } from "@/common/utils/id";
import { ErrorCodes } from "@/contracts";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import { BackgroundQueueScheduler } from "@/core/background-queue/background-queue.scheduler";
import {
  ddsExercises,
  ddsLessonInsights,
  type DdsLessonInsightsRecord,
} from "@/drizzle/schema";
import {
  STRUCTURED_OUTPUT_PORT,
  type StructuredOutputPort,
} from "@/modules/ai-gateway/ports/structured-output.port";

import { DdsReportService } from "./dds-report.service";

const RussianText = z
  .string()
  .trim()
  .min(4)
  .max(300)
  .refine(
    (value) => /[А-Яа-яЁё]/u.test(value),
    "Ожидается текст на русском языке",
  );

const InsightsSchema = z.object({
  strengths: z.array(RussianText).min(1).max(5),
  weaknesses: z.array(RussianText).min(1).max(5),
  recommendations: z.array(RussianText).min(1).max(5),
  focusScenarios: z.array(z.string().min(1)).max(10),
});

const INSIGHTS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["strengths", "weaknesses", "recommendations", "focusScenarios"],
  properties: {
    strengths: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: { type: "string" },
    },
    weaknesses: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: { type: "string" },
    },
    recommendations: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: { type: "string" },
    },
    focusScenarios: { type: "array", maxItems: 10, items: { type: "string" } },
  },
} as const;

const RawInsights = z.object({
  strengths: z.array(z.unknown()).default([]),
  weaknesses: z.array(z.unknown()).default([]),
  recommendations: z.array(z.unknown()).default([]),
  focusScenarios: z.array(z.unknown()).default([]),
});

/** Годные строки модели: остальное она добирает пустыми пунктами до длины списка. */
const usable = (values: readonly unknown[]) => [
  ...new Set(
    values.flatMap((value) => {
      const parsed = RussianText.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    }),
  ),
];

/**
 * Разбор ответа модели.
 *
 * Gemma заполняет списки до нужной длины пустыми строками и иногда называет
 * сценарий, которого в занятии не было. Такой ответ не выбрасывается целиком:
 * мусор отсеивается, а ошибкой считается только пустой результат — иначе
 * занятие остаётся вовсе без выводов из-за одного лишнего пункта.
 */
export function parseDdsInsights(
  value: unknown,
  allowedScenarioCodes: ReadonlySet<string>,
) {
  const raw = RawInsights.parse(value);
  const parsed = InsightsSchema.parse({
    strengths: usable(raw.strengths).slice(0, 5),
    weaknesses: usable(raw.weaknesses).slice(0, 5),
    recommendations: usable(raw.recommendations).slice(0, 5),
    focusScenarios: [
      ...new Set(
        raw.focusScenarios.filter(
          (code): code is string =>
            typeof code === "string" && allowedScenarioCodes.has(code),
        ),
      ),
    ].slice(0, 10),
  });
  return parsed;
}

@Injectable()
export class DdsInsightsService implements OnModuleInit {
  private readonly logger = new Logger(DdsInsightsService.name);
  private running = false;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService["db"],
    @Inject(STRUCTURED_OUTPUT_PORT)
    private readonly structured: StructuredOutputPort,
    private readonly config: ConfigService,
    private readonly reports: DdsReportService,
    @Optional() private readonly scheduler?: BackgroundQueueScheduler,
  ) {}

  onModuleInit(): void {
    this.scheduler?.register({
      name: "dds_insights",
      enabled: () => this.enabled(),
      run: () => this.drain(),
    });
  }

  async enqueue(lessonId: string): Promise<void> {
    // По занятию без единой карточки выводить нечего: модель тогда пишет,
    // что данных нет, и преподаватель видит пустой блок вместо разбора.
    if (!(await this.hasCards(lessonId))) return;
    await this.db
      .insert(ddsLessonInsights)
      .values({ id: generateId(), lessonId })
      .onConflictDoNothing({ target: ddsLessonInsights.lessonId });
    if (this.scheduler) this.scheduler.wake();
    else if (this.enabled()) void this.drain();
  }

  async retry(lessonId: string): Promise<void> {
    if (!(await this.hasCards(lessonId)))
      throw new AppBadRequestException(
        ErrorCodes.DDS_INSIGHTS_EMPTY_LESSON,
        "В занятии нет карточек, по которым можно сделать выводы",
      );
    await this.db
      .insert(ddsLessonInsights)
      .values({ id: generateId(), lessonId })
      .onConflictDoUpdate({
        target: ddsLessonInsights.lessonId,
        set: {
          status: "pending",
          attemptCount: 0,
          leaseToken: null,
          leaseUntil: null,
          error: null,
          updatedAt: new Date(),
        },
      });
    if (this.scheduler) this.scheduler.wake();
    else if (this.enabled()) void this.drain();
  }

  private async hasCards(lessonId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ cards: count() })
      .from(ddsExercises)
      .where(eq(ddsExercises.lessonId, lessonId));
    return Number(row?.cards ?? 0) > 0;
  }

  private enabled(): boolean {
    return ["1", "true", "yes", "on"].includes(
      String(
        this.config.get("DDS_INSIGHTS_WORKER_ENABLED") ?? "true",
      ).toLowerCase(),
    );
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const concurrency = Math.max(
        1,
        Math.min(8, Number(this.config.get("TOOLS_LLM_CONCURRENCY") ?? 1)),
      );
      await Promise.all(Array.from({ length: concurrency }, () => this.work()));
    } finally {
      this.running = false;
    }
  }

  private async work(): Promise<void> {
    for (;;) {
      const job = await this.claim();
      if (!job) return;
      try {
        await this.process(job);
      } catch (error) {
        await this.fail(job, error);
      }
    }
  }

  private claim(): Promise<DdsLessonInsightsRecord | null> {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [job] = await tx
        .select()
        .from(ddsLessonInsights)
        .where(
          and(
            lt(ddsLessonInsights.attemptCount, 3),
            or(
              eq(ddsLessonInsights.status, "pending"),
              and(
                eq(ddsLessonInsights.status, "processing"),
                or(
                  isNull(ddsLessonInsights.leaseUntil),
                  lt(ddsLessonInsights.leaseUntil, now),
                ),
              ),
            ),
          ),
        )
        .orderBy(asc(ddsLessonInsights.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!job) return null;
      const leaseToken = generateId();
      const timeout = Number(
        this.config.get("TOOLS_LLM_TIMEOUT_MS") ?? 120_000,
      );
      const [claimed] = await tx
        .update(ddsLessonInsights)
        .set({
          status: "processing",
          attemptCount: sql`${ddsLessonInsights.attemptCount} + 1`,
          leaseToken,
          leaseUntil: new Date(now.getTime() + timeout + 10_000),
          updatedAt: now,
        })
        .where(eq(ddsLessonInsights.id, job.id))
        .returning();
      return claimed ?? null;
    });
  }

  private async process(job: DdsLessonInsightsRecord): Promise<void> {
    const input = await this.reports.insightsInput(job.lessonId);
    const timeout = Number(this.config.get("TOOLS_LLM_TIMEOUT_MS") ?? 120_000);
    const response = await this.structured.complete({
      schemaName: "dds_group_insights",
      schemaDescription: "Краткие выводы по результатам группы ДДС",
      schema: INSIGHTS_JSON_SCHEMA,
      systemPrompt:
        "Сформулируй краткие практические выводы по обезличенной статистике занятия. Пиши только по-русски, не выставляй баллы и не придумывай факты.",
      userPrompt: JSON.stringify(input),
      maxTokens: 700,
      signal: AbortSignal.timeout(timeout),
    });
    const allowedCodes = new Set(input.scenarioCodes);
    const parsed = parseDdsInsights(response, allowedCodes);
    await this.db
      .update(ddsLessonInsights)
      .set({
        status: "done",
        strengths: parsed.strengths,
        weaknesses: parsed.weaknesses,
        recommendations: parsed.recommendations,
        focusScenarios: parsed.focusScenarios,
        model: this.config.get("TOOLS_LLM_MODEL") ?? "tools-model",
        error: null,
        leaseToken: null,
        leaseUntil: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ddsLessonInsights.id, job.id),
          eq(ddsLessonInsights.leaseToken, job.leaseToken!),
        ),
      );
  }

  private async fail(
    job: DdsLessonInsightsRecord,
    error: unknown,
  ): Promise<void> {
    const message =
      error instanceof Error ? error.message : "Неизвестная ошибка";
    this.logger.warn(`DDS insights ${job.lessonId} failed: ${message}`);
    await this.db
      .update(ddsLessonInsights)
      .set({
        status: job.attemptCount >= 3 ? "failed" : "pending",
        error: message.slice(0, 2_000),
        leaseToken: null,
        leaseUntil: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ddsLessonInsights.id, job.id),
          eq(ddsLessonInsights.leaseToken, job.leaseToken!),
        ),
      );
  }
}
