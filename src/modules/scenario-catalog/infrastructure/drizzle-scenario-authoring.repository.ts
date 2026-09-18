import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNotNull, ne } from "drizzle-orm";

import { generateId } from "@/common/utils/id";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  callerPersonas,
  escalationRules,
  mandatoryQuestions,
  referenceCardFields,
  scenarioFacts,
  scenarioLocations,
  scenarios,
  scenarioVersions,
  scenarioAudioPacks,
} from "@/drizzle/schema";
import { AuditLogService } from "@/modules/audit-log/audit-log.service";

import {
  toEditableScenario,
  toScenarioVersionRows,
} from "../domain/scenario-version-snapshot";
import {
  type EditableScenarioVersion,
  type ScenarioArchiveOutcome,
  ScenarioAuthoringConflictError,
  type PublishScenarioInput,
  type PublishScenarioVersionInput,
  type PublishedScenario,
  type ScenarioAuthoringRepository,
  ScenarioNotFoundError,
} from "../ports/scenario-authoring.repository";

type Database = DrizzleService["db"];
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

interface InsertVersionInput extends PublishScenarioInput {
  readonly scenarioId: string;
  readonly version: number;
  readonly publishedAt: Date;
}

@Injectable()
export class DrizzleScenarioAuthoringRepository implements ScenarioAuthoringRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly auditLog: AuditLogService,
  ) {}

  publish(input: PublishScenarioInput): Promise<PublishedScenario> {
    return this.db.transaction(async (tx) => {
      const [existingScenario] = await tx
        .select({ id: scenarios.id })
        .from(scenarios)
        .where(eq(scenarios.code, input.scenario.code))
        .limit(1);

      if (existingScenario) {
        throw new ScenarioAuthoringConflictError("scenario-code");
      }

      // Сценария ещё нет, поэтому любая персона с этим кодом чужая.
      const [existingPersona] = await tx
        .select({ id: callerPersonas.id })
        .from(callerPersonas)
        .where(eq(callerPersonas.code, input.scenario.persona.code))
        .limit(1);

      if (existingPersona) {
        throw new ScenarioAuthoringConflictError("persona-code");
      }

      const now = new Date();
      const scenarioId = generateId();

      await tx.insert(scenarios).values({
        id: scenarioId,
        code: input.scenario.code,
        title: input.scenario.title,
        category: input.scenario.category,
        difficulty: input.scenario.difficulty,
        summary: input.scenario.summary,
        status: "published",
        authorId: input.authorId,
        updatedAt: now,
      });

      return this.insertVersion(tx, {
        ...input,
        scenarioId,
        version: 1,
        publishedAt: now,
      });
    });
  }

  async loadVersion(
    scenarioVersionId: string,
  ): Promise<EditableScenarioVersion | null> {
    const [row] = await this.db
      .select({
        version: scenarioVersions,
        scenario: scenarios,
        persona: callerPersonas,
      })
      .from(scenarioVersions)
      .innerJoin(scenarios, eq(scenarioVersions.scenarioId, scenarios.id))
      .innerJoin(
        callerPersonas,
        eq(scenarioVersions.personaId, callerPersonas.id),
      )
      .where(
        and(
          eq(scenarioVersions.id, scenarioVersionId),
          eq(scenarios.status, "published"),
          isNotNull(scenarioVersions.publishedAt),
        ),
      )
      .limit(1);

    if (!row?.version.publishedAt) {
      return null;
    }

    const [location, facts, rules, questions, referenceFields, latest] =
      await Promise.all([
        this.db
          .select()
          .from(scenarioLocations)
          .where(eq(scenarioLocations.scenarioVersionId, scenarioVersionId))
          .limit(1),
        this.db
          .select()
          .from(scenarioFacts)
          .where(eq(scenarioFacts.scenarioVersionId, scenarioVersionId)),
        this.db
          .select()
          .from(escalationRules)
          .where(eq(escalationRules.scenarioVersionId, scenarioVersionId)),
        this.db
          .select()
          .from(mandatoryQuestions)
          .where(eq(mandatoryQuestions.scenarioVersionId, scenarioVersionId)),
        this.db
          .select()
          .from(referenceCardFields)
          .where(eq(referenceCardFields.scenarioVersionId, scenarioVersionId)),
        this.db
          .select({ version: scenarioVersions.version })
          .from(scenarioVersions)
          .where(eq(scenarioVersions.scenarioId, row.scenario.id))
          .orderBy(desc(scenarioVersions.version))
          .limit(1),
      ]);

    // Версия без места происшествия не публикуется ни сидом, ни конструктором:
    // такая строка — порча данных, и редактировать её нельзя.
    if (!location[0]) {
      return null;
    }

    return {
      scenarioId: row.scenario.id,
      scenarioVersionId: row.version.id,
      version: row.version.version,
      isLatest: latest[0]?.version === row.version.version,
      publishedAt: row.version.publishedAt.toISOString(),
      authoringSource: row.version.authoringSource,
      ...toEditableScenario({
        scenario: row.scenario,
        version: row.version,
        persona: row.persona,
        location: location[0],
        facts,
        escalationRules: rules,
        mandatoryQuestions: questions,
        referenceCardFields: referenceFields,
      }),
    };
  }

  publishVersion(
    input: PublishScenarioVersionInput,
  ): Promise<PublishedScenario> {
    return this.db.transaction(async (tx) => {
      // Строка сценария блокируется до конца транзакции: две правки одной и
      // той же версии иначе обе прошли бы проверку свежести и получили один
      // номер.
      const [scenario] = await tx
        .select({
          id: scenarios.id,
          code: scenarios.code,
          status: scenarios.status,
        })
        .from(scenarios)
        .where(eq(scenarios.id, input.scenarioId))
        .for("update")
        .limit(1);

      // Снятый с каталога сценарий правкой не воскрешается: для преподавателя
      // его больше нет, как нет и в редакторе.
      if (!scenario || scenario.status === "archived") {
        throw new ScenarioNotFoundError();
      }

      if (scenario.code !== input.scenario.code) {
        throw new ScenarioAuthoringConflictError("code-changed");
      }

      const [latest] = await tx
        .select({ id: scenarioVersions.id, version: scenarioVersions.version })
        .from(scenarioVersions)
        .where(eq(scenarioVersions.scenarioId, scenario.id))
        .orderBy(desc(scenarioVersions.version))
        .limit(1);

      if (!latest || latest.id !== input.baseVersionId) {
        throw new ScenarioAuthoringConflictError("stale-version");
      }

      // Код персоны повторяется у версий одного сценария, но занятый другим
      // сценарием код сделал бы двух разных заявителей неразличимыми.
      const [foreignPersona] = await tx
        .select({ id: callerPersonas.id })
        .from(callerPersonas)
        .innerJoin(
          scenarioVersions,
          eq(scenarioVersions.personaId, callerPersonas.id),
        )
        .where(
          and(
            eq(callerPersonas.code, input.scenario.persona.code),
            ne(scenarioVersions.scenarioId, scenario.id),
          ),
        )
        .limit(1);

      if (foreignPersona) {
        throw new ScenarioAuthoringConflictError("persona-code");
      }

      const now = new Date();

      // Карточка каталога показывает последнюю версию, поэтому описание
      // сценария следует за ней; сами версии остаются неизменными.
      await tx
        .update(scenarios)
        .set({
          title: input.scenario.title,
          category: input.scenario.category,
          difficulty: input.scenario.difficulty,
          summary: input.scenario.summary,
          status: "published",
          updatedAt: now,
        })
        .where(eq(scenarios.id, scenario.id));

      return this.insertVersion(
        tx,
        {
          ...input,
          scenarioId: scenario.id,
          version: latest.version + 1,
          publishedAt: now,
        },
        input.baseVersionId,
      );
    });
  }

  archive({
    scenarioId,
    actorId,
  }: {
    scenarioId: string;
    actorId: string;
  }): Promise<ScenarioArchiveOutcome> {
    return this.db.transaction(async (tx) => {
      const [scenario] = await tx
        .select({
          id: scenarios.id,
          code: scenarios.code,
          status: scenarios.status,
        })
        .from(scenarios)
        .where(eq(scenarios.id, scenarioId))
        .for("update")
        .limit(1);

      if (!scenario) {
        throw new ScenarioNotFoundError();
      }

      // Повторное удаление ничего не меняет и в аудит второй раз не пишется.
      if (scenario.status === "archived") {
        return "already-archived";
      }

      await tx
        .update(scenarios)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(scenarios.id, scenario.id));

      await this.auditLog.log(
        {
          actorId,
          action: "scenario.archive",
          resource: "scenario",
          resourceId: scenario.id,
          details: { code: scenario.code, previousStatus: scenario.status },
        },
        tx,
      );

      return "archived";
    });
  }

  private async insertVersion(
    tx: Transaction,
    input: InsertVersionInput,
    baseVersionId?: string,
  ): Promise<PublishedScenario> {
    const scenarioVersionId = generateId();
    const rows = toScenarioVersionRows({
      scenarioId: input.scenarioId,
      scenarioVersionId,
      personaId: generateId(),
      version: input.version,
      scenario: input.scenario,
      authorId: input.authorId,
      authoringSource: input.authoringSource,
      authoringPrompt: input.authoringPrompt,
      publishedAt: input.publishedAt,
      generateId,
    });

    await tx.insert(callerPersonas).values(rows.persona);
    await tx.insert(scenarioVersions).values(rows.version);
    await tx.insert(scenarioAudioPacks).values({ scenarioVersionId });
    await tx.insert(scenarioLocations).values(rows.location);
    await tx.insert(scenarioFacts).values([...rows.facts]);

    if (rows.escalationRules.length > 0) {
      await tx.insert(escalationRules).values([...rows.escalationRules]);
    }

    if (rows.mandatoryQuestions.length > 0) {
      await tx.insert(mandatoryQuestions).values([...rows.mandatoryQuestions]);
    }

    if (rows.referenceCardFields.length > 0) {
      await tx
        .insert(referenceCardFields)
        .values([...rows.referenceCardFields]);
    }

    await this.auditLog.log(
      {
        actorId: input.authorId,
        action: "scenario.publish",
        resource: "scenario-version",
        resourceId: scenarioVersionId,
        details: {
          scenarioId: input.scenarioId,
          code: input.scenario.code,
          version: input.version,
          authoringSource: input.authoringSource,
          ...(baseVersionId === undefined ? {} : { baseVersionId }),
        },
      },
      tx,
    );

    return {
      scenarioId: input.scenarioId,
      scenarioVersionId,
      code: input.scenario.code,
      title: input.scenario.title,
      version: input.version,
      status: "published",
      publishedAt: input.publishedAt.toISOString(),
    };
  }
}
