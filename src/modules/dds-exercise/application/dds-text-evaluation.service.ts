import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, asc, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";

import { generateId } from "@/common/utils/id";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  ddsCardReferences,
  ddsExerciseEvents,
  ddsExercises,
  ddsTextEvaluations,
  type DdsCardReferenceRecord,
  type DdsReferenceItem,
  type DdsTextEvaluationRecord,
} from "@/drizzle/schema";
import {
  STRUCTURED_OUTPUT_PORT,
  type StructuredOutputPort,
} from "@/modules/ai-gateway/ports/structured-output.port";
import { GrammarService } from "@/modules/grammar";
import { combineDdsTextScore } from "../domain/dds-exercise-evaluation";

const CoverageResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      status: z.enum(["present", "missing"]),
      quote: z.string().nullable(),
    }),
  ),
  contradictions: z.array(
    z.object({ description: z.string().min(1), quote: z.string().min(1) }),
  ),
  summary: z.string().min(1),
});

const COVERAGE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items", "contradictions", "summary"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "status", "quote"],
        properties: {
          id: { type: "string" },
          status: { enum: ["present", "missing"] },
          quote: { type: ["string", "null"] },
        },
      },
    },
    contradictions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "quote"],
        properties: {
          description: { type: "string" },
          quote: { type: "string" },
        },
      },
    },
    summary: { type: "string" },
  },
} as const;

export async function requestDdsTextCoverage(
  structured: StructuredOutputPort,
  input: {
    expectedOutcome: "accept" | "refuse";
    requiredItems: readonly DdsReferenceItem[];
    dispatcherText: string;
  },
  timeoutMs: number,
): Promise<z.infer<typeof CoverageResponseSchema>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const parsed = CoverageResponseSchema.parse(
        await structured.complete({
          schemaName: "dds_text_coverage",
          schemaDescription:
            "Покрытие подтверждённых пунктов эталона текстом диспетчера",
          schema: COVERAGE_JSON_SCHEMA,
          systemPrompt:
            "Проверь только наличие явно выраженных сведений. Не выставляй балл. Цитата обязана дословно присутствовать во входном тексте. Верни каждый переданный id ровно один раз.",
          userPrompt: JSON.stringify(input),
          maxTokens: 2_048,
          signal: AbortSignal.timeout(timeoutMs),
        }),
      );
      if (
        new Set(parsed.items.map(({ id }) => id)).size !==
          input.requiredItems.length ||
        parsed.items.some(
          ({ id }) => !input.requiredItems.some((item) => item.id === id),
        )
      )
        throw new Error("Модель вернула другой набор пунктов");
      return parsed;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export const buildQueueReferenceItems = (card: {
  victimsTotal: number | null;
}): DdsReferenceItem[] => [
  {
    id: "acknowledgement",
    label: "Подтверждение приёма карточки",
    hint: "Подтвердите получение сообщения",
    approved: true,
  },
  {
    id: "crew",
    label: "Направленная бригада",
    hint: "Укажите, какая бригада направлена",
    approved: true,
  },
  {
    id: "address",
    label: "Адрес или ориентир",
    hint: "Повторите адрес либо ориентир",
    approved: true,
  },
  ...(card.victimsTotal === null
    ? []
    : [
        {
          id: "victims",
          label: "Число пострадавших",
          hint: "Укажите число пострадавших",
          approved: true,
        },
      ]),
];

export function approvedDdsReferenceItems(
  reference: Pick<DdsCardReferenceRecord, "status" | "requiredItems"> | null,
): DdsReferenceItem[] {
  if (!reference || reference.status !== "approved") return [];
  // Частичное подтверждение намеренно не раскрывает и не оценивает остальные
  // пункты: они остаются лишь рабочей подсказкой преподавателю.
  return reference.requiredItems.filter((item) => item.approved);
}

export function shouldQueueDdsTextEvaluation(input: {
  status: string;
  completedAt: Date | null;
}): boolean {
  return input.completedAt !== null && input.status !== "lesson_finished";
}

@Injectable()
export class DdsTextEvaluationService implements OnModuleInit {
  private readonly logger = new Logger(DdsTextEvaluationService.name);
  private readonly workerId = generateId();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService["db"],
    @Inject(STRUCTURED_OUTPUT_PORT)
    private readonly structured: StructuredOutputPort,
    private readonly grammar: GrammarService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    // Незавершённая задача хранится в БД, поэтому после рестарта её можно безопасно подобрать снова.
    setTimeout(() => void this.drain(), 1_000).unref();
  }

  async enqueue(exerciseId: string): Promise<void> {
    const [exercise] = await this.db
      .select()
      .from(ddsExercises)
      .where(eq(ddsExercises.id, exerciseId))
      .limit(1);
    if (!exercise || !shouldQueueDdsTextEvaluation(exercise)) return;
    await this.ensureQueueReference(exercise);
    await this.db
      .insert(ddsTextEvaluations)
      .values({ id: generateId(), exerciseId })
      .onConflictDoNothing({ target: ddsTextEvaluations.exerciseId });
    void this.drain();
  }

  async retry(exerciseId: string): Promise<void> {
    await this.db
      .update(ddsTextEvaluations)
      .set({
        status: "pending",
        error: null,
        leaseOwner: null,
        leaseUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(ddsTextEvaluations.exerciseId, exerciseId));
    void this.drain();
  }

  async loadMany(
    ids: readonly string[],
  ): Promise<Map<string, DdsTextEvaluationRecord>> {
    if (!ids.length) return new Map();
    const rows = await this.db
      .select()
      .from(ddsTextEvaluations)
      .where(inArray(ddsTextEvaluations.exerciseId, [...ids]));
    return new Map(rows.map((row) => [row.exerciseId, row]));
  }

  private async drain(): Promise<void> {
    for (;;) {
      const task = await this.claim();
      if (!task) return;
      await this.process(task).catch((error: unknown) =>
        this.fail(task, error),
      );
    }
  }

  private claim(): Promise<DdsTextEvaluationRecord | null> {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [task] = await tx
        .select()
        .from(ddsTextEvaluations)
        .where(
          and(
            eq(ddsTextEvaluations.status, "pending"),
            or(
              isNull(ddsTextEvaluations.leaseUntil),
              lt(ddsTextEvaluations.leaseUntil, now),
            ),
          ),
        )
        .orderBy(asc(ddsTextEvaluations.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!task) return null;
      const leaseUntil = new Date(
        now.getTime() +
          // Значение из окружения может прийти строкой: без приведения срок
          // аренды склеивается в строку и становится Invalid Date.
          Number(this.config.get("TOOLS_LLM_TIMEOUT_MS") ?? 120_000) +
          10_000,
      );
      const [claimed] = await tx
        .update(ddsTextEvaluations)
        .set({ leaseOwner: this.workerId, leaseUntil, updatedAt: now })
        .where(eq(ddsTextEvaluations.id, task.id))
        .returning();
      return claimed ?? null;
    });
  }

  private async process(task: DdsTextEvaluationRecord): Promise<void> {
    const [exercise] = await this.db
      .select()
      .from(ddsExercises)
      .where(eq(ddsExercises.id, task.exerciseId))
      .limit(1);
    if (!exercise || exercise.status === "lesson_finished")
      return this.markSkipped(task.id, "Карточка завершена преподавателем");
    const [reference] = await this.db
      .select()
      .from(ddsCardReferences)
      .where(
        exercise.sourceTrainingSessionId
          ? eq(ddsCardReferences.exerciseId, exercise.id)
          : eq(ddsCardReferences.scenarioVersionId, exercise.scenarioVersionId),
      )
      .limit(1);
    const approvedItems = approvedDdsReferenceItems(reference ?? null);
    if (approvedItems.length === 0)
      return this.markSkipped(task.id, "Нет подтверждённого эталона");
    const events = await this.db
      .select()
      .from(ddsExerciseEvents)
      .where(eq(ddsExerciseEvents.exerciseId, exercise.id))
      .orderBy(asc(ddsExerciseEvents.sequence));
    const texts = events
      .filter((event) => event.comment?.trim())
      .map((event) => ({
        id: `transition-${event.sequence}`,
        label: `Комментарий к статусу ${event.toStatus}`,
        value: event.comment!,
        style: "prose" as const,
      }));
    const joined = texts
      .map((item) => `[${item.label}] ${item.value}`)
      .join("\n");
    const started = Date.now();
    const timeout = Number(this.config.get("TOOLS_LLM_TIMEOUT_MS") ?? 120_000);
    const parsed = await requestDdsTextCoverage(
      this.structured,
      {
        expectedOutcome: reference.expectedOutcome,
        requiredItems: approvedItems,
        dispatcherText: joined,
      },
      timeout,
    );
    const grammar = await this.grammar.check(texts, {
      deepReview: true,
      signal: AbortSignal.timeout(timeout),
    });
    const coverage = approvedItems.map((item) => {
      const found = parsed!.items.find(({ id }) => id === item.id)!;
      return {
        id: item.id,
        label: item.label,
        status: found.status,
        quote: found.quote,
      };
    });
    await this.db
      .update(ddsTextEvaluations)
      .set({
        status: "done",
        referenceVersion: reference.version,
        coverage,
        contradictions: parsed.contradictions,
        summary: parsed.summary,
        grammar: grammar as unknown as Record<string, unknown>,
        model: this.config.get<string>("TOOLS_LLM_MODEL") ?? "tools-model",
        durationMs: Date.now() - started,
        error: null,
        leaseOwner: null,
        leaseUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(ddsTextEvaluations.id, task.id));
    const combined = combineDdsTextScore({
      baseScore: exercise.score ?? 0,
      presentItems: coverage.filter(({ status }) => status === "present")
        .length,
      totalItems: coverage.length,
      contradictions: parsed.contradictions.length,
      grammarErrors: grammar.errorCount,
      grammarStyleIssues: grammar.styleCount,
      passThreshold: exercise.passThreshold,
    });
    await this.db
      .update(ddsExercises)
      .set({
        score: combined.score,
        passed: combined.passed,
        updatedAt: new Date(),
      })
      .where(eq(ddsExercises.id, exercise.id));
  }

  private async ensureQueueReference(
    exercise: typeof ddsExercises.$inferSelect,
  ): Promise<DdsCardReferenceRecord | null> {
    if (!exercise.sourceTrainingSessionId) return null;
    const items = buildQueueReferenceItems(exercise.card);
    const [row] = await this.db
      .insert(ddsCardReferences)
      .values({
        id: generateId(),
        exerciseId: exercise.id,
        expectedOutcome: "accept",
        requiredItems: items,
        expectedCrewService: exercise.addressedService,
        status: "approved",
        approvedAt: new Date(),
      })
      .onConflictDoNothing({
        target: ddsCardReferences.exerciseId,
        // Индекс частичный, и предикат нужен, чтобы Postgres его распознал.
        where: isNotNull(ddsCardReferences.exerciseId),
      })
      .returning();
    return row ?? null;
  }

  private async markSkipped(id: string, error: string): Promise<void> {
    await this.db
      .update(ddsTextEvaluations)
      .set({
        status: "skipped",
        error,
        leaseOwner: null,
        leaseUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(ddsTextEvaluations.id, id));
  }

  private async fail(
    task: DdsTextEvaluationRecord,
    error: unknown,
  ): Promise<void> {
    const message =
      error instanceof Error ? error.message : "Неизвестная ошибка";
    this.logger.warn(
      `DDS text evaluation ${task.exerciseId} failed: ${message}`,
    );
    await this.db
      .update(ddsTextEvaluations)
      .set({
        status: "failed",
        error: message.slice(0, 2_000),
        leaseOwner: null,
        leaseUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(ddsTextEvaluations.id, task.id));
  }
}
