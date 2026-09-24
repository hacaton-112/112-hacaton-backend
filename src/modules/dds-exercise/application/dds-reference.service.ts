import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import {
  AppBadRequestException,
  AppNotFoundException,
} from "@/common/exceptions/app.exception";
import { generateId } from "@/common/utils/id";
import { ErrorCodes } from "@/contracts";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import { BackgroundQueueScheduler } from "@/core/background-queue/background-queue.scheduler";
import {
  ddsCardReferences,
  scenarioFacts,
  scenarios,
  scenarioVersions,
  type DdsCardReferenceRecord,
} from "@/drizzle/schema";
import {
  STRUCTURED_OUTPUT_PORT,
  type StructuredOutputPort,
} from "@/modules/ai-gateway/ports/structured-output.port";
import type { TrainingActor } from "@/modules/training/training.service";

import type {
  DdsReferenceListQuery,
  UpdateDdsReference,
} from "../dto/dds-reference.dto";
import { latestVersionPerScenario } from "@/modules/scenario-catalog/domain/latest-version-per-scenario";

export { latestVersionPerScenario } from "@/modules/scenario-catalog/domain/latest-version-per-scenario";

const SERVICE_BY_SCENARIO_SERVICE = {
  fire: "dds_01",
  police: "dds_02",
  ambulance: "dds_03",
  gas: "dds_04",
} as const;

/**
 * По одной, самой свежей версии каждого сценария.
 *
 * Эталон живёт на конкретной версии: если взять не ту, список покажет, что
 * эталона нет, хотя он есть. Сборка словаря из отсортированного списка на это
 * и напоролась — в словаре побеждает последняя запись, то есть самая старая
 * версия.
 */
export function expectedCrewServiceFromScenario(services: readonly string[]) {
  for (const service of services) {
    const mapped =
      SERVICE_BY_SCENARIO_SERVICE[
        service as keyof typeof SERVICE_BY_SCENARIO_SERVICE
      ];
    if (mapped) return mapped;
  }
  return null;
}

/** Подписи видит преподаватель при утверждении: только по-русски. */
const RussianText = z
  .string()
  .min(2)
  .regex(/[А-Яа-яЁё]/u, "Пишите по-русски");

const GeneratedSchema = z.object({
  expectedOutcome: z.enum(["accept", "refuse"]),
  refusalReasons: z.array(RussianText).max(20),
  requiredItems: z
    .array(
      z.object({
        id: z.string().min(1),
        label: RussianText,
        hint: RussianText,
      }),
    )
    .min(1)
    .max(30),
  expectedCrewService: z.string().nullable(),
});
const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "expectedOutcome",
    "refusalReasons",
    "requiredItems",
    "expectedCrewService",
  ],
  properties: {
    expectedOutcome: { enum: ["accept", "refuse"] },
    refusalReasons: { type: "array", items: { type: "string" } },
    requiredItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "hint"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          hint: { type: "string" },
        },
      },
    },
    expectedCrewService: { type: ["string", "null"] },
  },
} as const;

/**
 * Эталон — для диспетчера ДДС, а не для оператора 112.
 *
 * Без этого модель перечисляла поля адреса — работу оператора, который
 * заполняет карточку, — и писала подписи по-английски.
 */
const REFERENCE_PROMPT = [
  "Ты готовишь эталон для проверки рабочих комментариев диспетчера ДДС (не оператора 112).",
  "Диспетчер получил уже заполненную карточку происшествия и пишет короткие комментарии при смене статуса: «Принята», «Работы завершены» или «Отказ».",
  "Перечисли 3–6 сведений, которые должны быть в его комментариях по этой карточке: подтверждение приёма, какая бригада или наряд направлены, ориентир или уточнение места из карточки, что сделано на месте, итог работ.",
  "Не требуй того, что диспетчер не может знать, и не перечисляй поля адреса — их заполнил оператор 112.",
  "label — коротко по-русски, что должно прозвучать, например «Бригада направлена»; hint — по-русски, как это обычно пишут, например «Указать номер или тип бригады»; id — короткий латинский идентификатор.",
  "expectedOutcome — accept, если служба должна отработать карточку; refuse — если карточка не для неё. refusalReasons — по-русски допустимые причины отказа, пустой список, если отказ не ожидается.",
  "Не пиши готовый ответ и не выставляй балл.",
].join(" ");

@Injectable()
export class DdsReferenceService implements OnModuleInit {
  private readonly logger = new Logger(DdsReferenceService.name);
  private running = false;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService["db"],
    @Inject(STRUCTURED_OUTPUT_PORT)
    private readonly structured: StructuredOutputPort,
    private readonly config: ConfigService,
    @Optional() private readonly scheduler?: BackgroundQueueScheduler,
  ) {}

  onModuleInit(): void {
    this.scheduler?.register({
      name: "dds_reference_generation",
      enabled: () => true,
      run: () => this.drain(),
    });
  }

  async list(query: DdsReferenceListQuery) {
    const versions = await this.db
      .select({
        id: scenarioVersions.id,
        scenarioId: scenarioVersions.scenarioId,
        version: scenarioVersions.version,
        services: scenarioVersions.expectedServices,
        code: scenarios.code,
        title: scenarios.title,
        category: scenarios.category,
      })
      .from(scenarioVersions)
      .innerJoin(scenarios, eq(scenarios.id, scenarioVersions.scenarioId))
      .where(
        and(
          eq(scenarios.status, "published"),
          isNotNull(scenarioVersions.publishedAt),
        ),
      )
      .orderBy(desc(scenarioVersions.version));
    const current = latestVersionPerScenario(versions);
    const ids = current.map(({ id }) => id);
    const references = ids.length
      ? await this.db
          .select()
          .from(ddsCardReferences)
          .where(inArray(ddsCardReferences.scenarioVersionId, ids))
      : [];
    const byVersion = new Map(
      references.map((row) => [row.scenarioVersionId, row]),
    );
    const items = current
      .map((version) => {
        const reference = byVersion.get(version.id);
        return {
          scenarioVersionId: version.id,
          code: version.code,
          title: version.title,
          category: version.category,
          status: reference?.status ?? ("missing" as const),
          jobStatus: reference?.jobStatus ?? null,
          approvedItems:
            reference?.requiredItems.filter(({ approved }) => approved)
              .length ?? 0,
          totalItems: reference?.requiredItems.length ?? 0,
          expectedCrewService:
            reference?.expectedCrewService ??
            expectedCrewServiceFromScenario(version.services),
          error: reference?.error ?? null,
        };
      })
      .filter(({ status }) => !query.status || status === query.status)
      .sort((left, right) => left.code.localeCompare(right.code, "ru"));
    const offset = (query.page - 1) * query.pageSize;
    return {
      items: items.slice(offset, offset + query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      total: items.length,
    };
  }

  async approveMany(actor: TrainingActor, versionIds: string[]) {
    const rows = await this.db
      .select()
      .from(ddsCardReferences)
      .where(inArray(ddsCardReferences.scenarioVersionId, versionIds));
    const accepted: string[] = [];
    const rejected: { scenarioVersionId: string; reason: string }[] = [];
    for (const versionId of versionIds) {
      const row = rows.find(
        ({ scenarioVersionId }) => scenarioVersionId === versionId,
      );
      const reason = !row
        ? "Эталон ещё не сформирован"
        : row.requiredItems.length === 0
          ? "В эталоне нет ни одного пункта"
          : row.expectedOutcome === "refuse" && row.refusalReasons.length === 0
            ? "Для отказа нужна хотя бы одна допустимая причина"
            : null;
      if (reason) {
        rejected.push({ scenarioVersionId: versionId, reason });
        continue;
      }
      await this.db
        .update(ddsCardReferences)
        .set({
          requiredItems: row!.requiredItems.map((item) => ({
            ...item,
            approved: true,
          })),
          status: "approved",
          approvedBy: actor.id,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(ddsCardReferences.id, row!.id));
      accepted.push(versionId);
    }
    return { accepted, rejected };
  }

  async regenerateMany(versionIds: string[]) {
    const versions = await this.db
      .select({
        id: scenarioVersions.id,
        services: scenarioVersions.expectedServices,
      })
      .from(scenarioVersions)
      .where(inArray(scenarioVersions.id, versionIds));
    const accepted: string[] = [];
    const rejected: { scenarioVersionId: string; reason: string }[] = [];
    for (const versionId of versionIds) {
      const version = versions.find(({ id }) => id === versionId);
      if (!version) {
        rejected.push({
          scenarioVersionId: versionId,
          reason: "Версия сценария не найдена",
        });
        continue;
      }
      await this.db
        .insert(ddsCardReferences)
        .values({
          id: generateId(),
          scenarioVersionId: versionId,
          expectedOutcome: "accept",
          requiredItems: [],
          expectedCrewService: expectedCrewServiceFromScenario(
            version.services,
          ),
          status: "draft",
          jobStatus: "pending",
        })
        .onConflictDoUpdate({
          target: ddsCardReferences.scenarioVersionId,
          targetWhere: isNotNull(ddsCardReferences.scenarioVersionId),
          set: {
            jobStatus: "pending",
            attemptCount: 0,
            leaseOwner: null,
            leaseUntil: null,
            error: null,
            updatedAt: new Date(),
          },
        });
      accepted.push(versionId);
    }
    if (this.scheduler) this.scheduler.wake();
    else void this.drain();
    return { accepted, rejected };
  }

  async backfillServices(): Promise<{ updated: number; unresolved: number }> {
    const rows = await this.db
      .select({
        referenceId: ddsCardReferences.id,
        services: scenarioVersions.expectedServices,
      })
      .from(ddsCardReferences)
      .innerJoin(
        scenarioVersions,
        eq(scenarioVersions.id, ddsCardReferences.scenarioVersionId),
      )
      .where(isNull(ddsCardReferences.expectedCrewService));
    let updated = 0;
    let unresolved = 0;
    for (const row of rows) {
      const service = expectedCrewServiceFromScenario(row.services);
      if (!service) {
        unresolved += 1;
        continue;
      }
      await this.db
        .update(ddsCardReferences)
        .set({ expectedCrewService: service, updatedAt: new Date() })
        .where(eq(ddsCardReferences.id, row.referenceId));
      updated += 1;
    }
    return { updated, unresolved };
  }

  async getScenario(versionId: string) {
    const [existing] = await this.db
      .select()
      .from(ddsCardReferences)
      .where(eq(ddsCardReferences.scenarioVersionId, versionId))
      .limit(1);
    return this.present(existing ?? (await this.generate(versionId, null)));
  }

  async regenerate(versionId: string, comment: string) {
    const [version] = await this.db
      .select({ services: scenarioVersions.expectedServices })
      .from(scenarioVersions)
      .where(eq(scenarioVersions.id, versionId))
      .limit(1);
    if (!version)
      throw new AppNotFoundException(
        "SCENARIO_VERSION_NOT_FOUND",
        "Версия сценария не найдена",
      );
    const [queued] = await this.db
      .insert(ddsCardReferences)
      .values({
        id: generateId(),
        scenarioVersionId: versionId,
        expectedOutcome: "accept",
        requiredItems: [],
        expectedCrewService: expectedCrewServiceFromScenario(version.services),
        status: "draft",
        jobStatus: "pending",
        generationComment: comment,
      })
      .onConflictDoUpdate({
        target: ddsCardReferences.scenarioVersionId,
        targetWhere: isNotNull(ddsCardReferences.scenarioVersionId),
        set: {
          jobStatus: "pending",
          generationComment: comment,
          attemptCount: 0,
          leaseOwner: null,
          leaseUntil: null,
          error: null,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (this.scheduler) this.scheduler.wake();
    else void this.drain();
    return this.present(queued!);
  }

  async update(
    actor: TrainingActor,
    versionId: string,
    input: UpdateDdsReference,
  ) {
    const approving =
      input.approveAll || input.requiredItems.some((item) => item.approved);
    const approvedItems = input.requiredItems.filter(
      (item) => item.approved || input.approveAll,
    );
    if (approving && approvedItems.length === 0)
      throw new AppBadRequestException(
        ErrorCodes.DDS_REFERENCE_INVALID,
        "Для подтверждения нужен хотя бы один утверждённый пункт",
      );
    if (
      approving &&
      input.expectedOutcome === "refuse" &&
      input.refusalReasons.length === 0
    )
      throw new AppBadRequestException(
        ErrorCodes.DDS_REFERENCE_INVALID,
        "Для исхода «отказ» нужна хотя бы одна допустимая причина",
      );
    const now = new Date();
    const [updated] = await this.db
      .update(ddsCardReferences)
      .set({
        expectedOutcome: input.expectedOutcome,
        refusalReasons:
          input.expectedOutcome === "refuse" ? input.refusalReasons : [],
        requiredItems: input.approveAll
          ? input.requiredItems.map((item) => ({ ...item, approved: true }))
          : input.requiredItems,
        expectedCrewService: input.expectedCrewService,
        status: approving ? "approved" : "draft",
        approvedBy: approving ? actor.id : null,
        approvedAt: approving ? now : null,
        version: sql`${ddsCardReferences.version} + 1`,
        updatedAt: now,
      })
      .where(eq(ddsCardReferences.scenarioVersionId, versionId))
      .returning();
    if (!updated)
      throw new AppNotFoundException(
        "DDS_REFERENCE_NOT_FOUND",
        "Эталон карточки не найден",
      );
    return this.present(updated);
  }

  async preparePublished(
    onPrepared?: (result: {
      versionId: string;
      durationMs: number;
      ok: boolean;
      error?: string;
    }) => void,
  ): Promise<{ prepared: number; failed: number }> {
    const rows = await this.db
      .select({
        id: scenarioVersions.id,
        scenarioId: scenarioVersions.scenarioId,
      })
      .from(scenarioVersions)
      .innerJoin(scenarios, eq(scenarios.id, scenarioVersions.scenarioId))
      .where(
        and(
          eq(scenarios.status, "published"),
          isNotNull(scenarioVersions.publishedAt),
        ),
      )
      .orderBy(desc(scenarioVersions.version));
    // Эталон нужен только действующей версии: прошлые остаются за
    // проведёнными звонками, и готовить их — вдвое дольше впустую.
    const current = new Map<string, string>();
    for (const row of rows) {
      if (!current.has(row.scenarioId)) current.set(row.scenarioId, row.id);
    }
    const versions = [...current.values()].map((id) => ({ id }));
    let prepared = 0;
    let failed = 0;
    for (const { id } of versions) {
      const startedAt = Date.now();
      try {
        await this.generate(id, null);
        prepared += 1;
        onPrepared?.({
          versionId: id,
          durationMs: Date.now() - startedAt,
          ok: true,
        });
      } catch (error) {
        failed += 1;
        onPrepared?.({
          versionId: id,
          durationMs: Date.now() - startedAt,
          ok: false,
          error:
            error instanceof Error
              ? error.message.slice(0, 300)
              : String(error),
        });
      }
    }
    return { prepared, failed };
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const task = await this.claim();
        if (!task) return;
        const started = Date.now();
        try {
          await this.generate(task.scenarioVersionId!, task.generationComment, {
            id: task.id,
            token: task.leaseOwner!,
          });
          this.logger.log(
            `Эталон ${task.id} сформирован за ${Date.now() - started} мс`,
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Неизвестная ошибка генерации";
          await this.db
            .update(ddsCardReferences)
            .set({
              jobStatus: task.attemptCount >= 3 ? "failed" : "pending",
              error: message.slice(0, 2_000),
              leaseOwner: null,
              leaseUntil: null,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(ddsCardReferences.id, task.id),
                eq(ddsCardReferences.leaseOwner, task.leaseOwner!),
              ),
            );
          this.logger.warn(
            `Эталон ${task.id} не сформирован за ${Date.now() - started} мс: ${message}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private claim(): Promise<DdsCardReferenceRecord | null> {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [task] = await tx
        .select()
        .from(ddsCardReferences)
        .where(
          and(
            isNotNull(ddsCardReferences.scenarioVersionId),
            lt(ddsCardReferences.attemptCount, 3),
            or(
              eq(ddsCardReferences.jobStatus, "pending"),
              and(
                eq(ddsCardReferences.jobStatus, "processing"),
                or(
                  isNull(ddsCardReferences.leaseUntil),
                  lt(ddsCardReferences.leaseUntil, now),
                ),
              ),
            ),
          ),
        )
        .orderBy(ddsCardReferences.updatedAt)
        .limit(1)
        .for("update", { skipLocked: true });
      if (!task) return null;
      const token = generateId();
      const configured = Number(
        this.config.get("TOOLS_LLM_TIMEOUT_MS") ?? 120_000,
      );
      const timeout =
        Number.isFinite(configured) && configured > 0 ? configured : 120_000;
      const [claimed] = await tx
        .update(ddsCardReferences)
        .set({
          jobStatus: "processing",
          attemptCount: sql`${ddsCardReferences.attemptCount} + 1`,
          leaseOwner: token,
          leaseUntil: new Date(now.getTime() + timeout + 10_000),
          updatedAt: now,
        })
        .where(eq(ddsCardReferences.id, task.id))
        .returning();
      return claimed ?? null;
    });
  }

  private async generate(
    versionId: string,
    comment: string | null,
    lease?: { id: string; token: string },
  ): Promise<DdsCardReferenceRecord> {
    const [source] = await this.db
      .select({ version: scenarioVersions, scenario: scenarios })
      .from(scenarioVersions)
      .innerJoin(scenarios, eq(scenarios.id, scenarioVersions.scenarioId))
      .where(eq(scenarioVersions.id, versionId))
      .limit(1);
    if (!source)
      throw new AppNotFoundException(
        "SCENARIO_VERSION_NOT_FOUND",
        "Версия сценария не найдена",
      );
    const facts = await this.db
      .select({
        label: scenarioFacts.displayLabel,
        value: scenarioFacts.promptValue,
        cardValue: scenarioFacts.cardValue,
      })
      .from(scenarioFacts)
      .where(eq(scenarioFacts.scenarioVersionId, versionId));
    let parsed: z.infer<typeof GeneratedSchema> | null = null;
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        parsed = GeneratedSchema.parse(
          await this.structured.complete({
            schemaName: "dds_card_reference",
            schemaDescription: "Эталон текста действий диспетчера ДДС",
            schema: JSON_SCHEMA,
            systemPrompt: REFERENCE_PROMPT,
            userPrompt: JSON.stringify({
              title: source.scenario.title,
              summary: source.scenario.summary,
              facts,
              referenceNotes: source.version.referenceNotes,
              services: source.version.expectedServices,
              instructorComment: comment,
            }),
            maxTokens: 700,
            signal: AbortSignal.timeout(
              Number(process.env.TOOLS_LLM_TIMEOUT_MS ?? 120_000),
            ),
          }),
        );
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!parsed) throw lastError;
    const values = {
      expectedOutcome: parsed.expectedOutcome,
      refusalReasons: parsed.refusalReasons,
      requiredItems: parsed.requiredItems.map((item) => ({
        ...item,
        approved: false,
      })),
      expectedCrewService:
        expectedCrewServiceFromScenario(source.version.expectedServices) ??
        this.service(parsed.expectedCrewService),
      status: "draft" as const,
      jobStatus: "done" as const,
      generationComment: comment,
      approvedBy: null,
      approvedAt: null,
      error: null,
      leaseOwner: null,
      leaseUntil: null,
      updatedAt: new Date(),
    };
    if (lease) {
      const [saved] = await this.db
        .update(ddsCardReferences)
        .set({ ...values, attemptCount: 0 })
        .where(
          and(
            eq(ddsCardReferences.id, lease.id),
            eq(ddsCardReferences.leaseOwner, lease.token),
          ),
        )
        .returning();
      if (!saved) throw new Error("Аренда задания эталона уже потеряна");
      return saved;
    }
    const [saved] = await this.db
      .insert(ddsCardReferences)
      .values({ id: generateId(), scenarioVersionId: versionId, ...values })
      .onConflictDoUpdate({
        target: ddsCardReferences.scenarioVersionId,
        // Индекс частичный: без того же условия Postgres не находит его для
        // ON CONFLICT и отклоняет каждую запись эталона.
        targetWhere: isNotNull(ddsCardReferences.scenarioVersionId),
        set: {
          ...values,
          version: sql`${ddsCardReferences.version} + 1`,
        },
      })
      .returning();
    return saved!;
  }

  private service(value: string | null) {
    const map: Record<string, "dds_01" | "dds_02" | "dds_03" | "dds_04"> = {
      fire: "dds_01",
      police: "dds_02",
      ambulance: "dds_03",
      gas: "dds_04",
      dds_01: "dds_01",
      dds_02: "dds_02",
      dds_03: "dds_03",
      dds_04: "dds_04",
    };
    return value ? (map[value] ?? null) : null;
  }

  private present(row: DdsCardReferenceRecord) {
    return {
      id: row.id,
      scenarioVersionId: row.scenarioVersionId,
      exerciseId: row.exerciseId,
      expectedOutcome: row.expectedOutcome,
      refusalReasons: row.refusalReasons,
      requiredItems: row.requiredItems,
      expectedCrewService: row.expectedCrewService,
      status: row.status,
      jobStatus: row.jobStatus,
      version: row.version,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      error: row.error,
    };
  }
}
