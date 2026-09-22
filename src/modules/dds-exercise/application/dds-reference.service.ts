import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { AppNotFoundException } from "@/common/exceptions/app.exception";
import { generateId } from "@/common/utils/id";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
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

import type { UpdateDdsReference } from "../dto/dds-reference.dto";

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
export class DdsReferenceService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService["db"],
    @Inject(STRUCTURED_OUTPUT_PORT)
    private readonly structured: StructuredOutputPort,
  ) {}

  async getScenario(versionId: string) {
    const [existing] = await this.db
      .select()
      .from(ddsCardReferences)
      .where(eq(ddsCardReferences.scenarioVersionId, versionId))
      .limit(1);
    return this.present(existing ?? (await this.generate(versionId, null)));
  }

  async regenerate(versionId: string, comment: string) {
    return this.present(await this.generate(versionId, comment));
  }

  async update(
    actor: TrainingActor,
    versionId: string,
    input: UpdateDdsReference,
  ) {
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
        status:
          input.approveAll || input.requiredItems.some((item) => item.approved)
            ? "approved"
            : "draft",
        approvedBy:
          input.approveAll || input.requiredItems.some((item) => item.approved)
            ? actor.id
            : null,
        approvedAt:
          input.approveAll || input.requiredItems.some((item) => item.approved)
            ? now
            : null,
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

  private async generate(
    versionId: string,
    comment: string | null,
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
            maxTokens: 2_048,
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
      expectedCrewService: this.service(parsed.expectedCrewService),
      status: "draft" as const,
      generationComment: comment,
      approvedBy: null,
      approvedAt: null,
      error: null,
      updatedAt: new Date(),
    };
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
      version: row.version,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      error: row.error,
    };
  }
}
