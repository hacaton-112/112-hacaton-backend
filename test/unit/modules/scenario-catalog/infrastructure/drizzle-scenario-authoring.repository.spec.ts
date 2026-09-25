import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  callerPersonas,
  scenarioLocations,
  scenarios,
  scenarioVersions,
  scenarioAudioPacks,
  dialoguePreparations,
} from "@/drizzle/schema";
import type { AuditLogService } from "@/modules/audit-log/application/audit-log.service";
import {
  type ScenarioSeed,
  ScenarioSeedSchema,
} from "@/modules/scenario-engine/domain/scenario-seed.schema";

import { toScenarioVersionRows } from "@/modules/scenario-catalog/domain/scenario-version-snapshot";
import {
  ScenarioAuthoringConflictError,
  ScenarioNotFoundError,
} from "@/modules/scenario-catalog/ports/scenario-authoring.repository";
import { DrizzleScenarioAuthoringRepository } from "@/modules/scenario-catalog/infrastructure/drizzle-scenario-authoring.repository";
import {
  initialEntries,
  preparationHash,
  preparationRequests,
} from "@/modules/scenario-audio/domain/dialogue-preparation";
import { audioFingerprint } from "@/modules/scenario-audio/domain/prepared-dialogue";

const shippedScenario = (): ScenarioSeed =>
  ScenarioSeedSchema.parse(
    JSON.parse(
      readFileSync(
        join(process.cwd(), "drizzle/seed/scenarios/s-015-fire-apartment.json"),
        "utf8",
      ),
    ),
  );

/**
 * Билдер запросов Drizzle: любой метод возвращает цепочку, а ожидание цепочки
 * отдаёт очередной заранее заданный результат выборки.
 */
const queryChain = (result: unknown) => {
  const chain: Record<string, unknown> = {};

  for (const method of [
    "from",
    "innerJoin",
    "where",
    "orderBy",
    "limit",
    "for",
  ]) {
    chain[method] = () => chain;
  }

  chain.then = (
    resolve: (value: unknown) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);

  return chain;
};

const createRepository = (selectResults: unknown[]) => {
  const inserts: { table: unknown; values: unknown }[] = [];
  const updates: { table: unknown; values: unknown }[] = [];
  const client = {
    select: () => queryChain(selectResults.shift() ?? []),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });

        return Promise.resolve();
      },
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: () => {
          updates.push({ table, values });

          return Promise.resolve();
        },
      }),
    }),
  };
  const auditLog = { log: jest.fn().mockResolvedValue(undefined) };
  const database = {
    ...client,
    transaction: (work: (tx: typeof client) => Promise<unknown>) =>
      work(client),
  };

  return {
    repository: new DrizzleScenarioAuthoringRepository(
      database as never,
      auditLog as unknown as AuditLogService,
    ),
    inserts,
    updates,
    auditLog,
  };
};

const SCENARIO_ID = "5b6c3f2e-0f7a-4d4b-9a3e-1f0c2d3e4f50";
const BASE_VERSION_ID = "7d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6";

const editInput = (scenario = shippedScenario()) => ({
  scenarioId: SCENARIO_ID,
  baseVersionId: BASE_VERSION_ID,
  scenario,
  authorId: "instructor-1",
  authoringSource: "manual" as const,
});

describe("approved preparation publication", () => {
  const prepared = (scenario = shippedScenario()) => ({
    id: "preparation",
    ownerId: "instructor-1",
    status: "ready",
    approvedAt: new Date(),
    scenarioVersionId: null,
    snapshotHash: preparationHash(scenario),
    revision: 3,
    entries: initialEntries(scenario),
    assets: Object.fromEntries(
      preparationRequests("preparation", scenario).map((request) => [
        audioFingerprint(request),
        {
          key: "synthetic.pcm",
          bytes: 2,
          sampleRate: 24000,
          sha256: "a".repeat(64),
        },
      ]),
    ),
  });
  it("binds the approved bank and audio to the new immutable version in the publication transaction", async () => {
    const scenario = shippedScenario();
    const pack = prepared(scenario);
    const { repository, inserts, updates, auditLog } = createRepository([
      [],
      [],
      [pack],
    ]);
    const published = await repository.publish({
      scenario,
      authorId: "instructor-1",
      authoringSource: "manual",
      preparationId: pack.id,
    });
    expect(inserts).toContainEqual({
      table: scenarioAudioPacks,
      values: expect.objectContaining({
        scenarioVersionId: published.scenarioVersionId,
        status: "ready",
        entries: pack.entries,
        assets: pack.assets,
      }),
    });
    expect(updates).toContainEqual({
      table: dialoguePreparations,
      values: expect.objectContaining({
        status: "published",
        scenarioVersionId: published.scenarioVersionId,
      }),
    });
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "scenario.dialogue.publish" }),
      expect.anything(),
    );
  });
  it.each([
    { ownerId: "another-instructor" },
    { status: "review" },
    { approvedAt: null },
    { scenarioVersionId: "already-published" },
    { snapshotHash: "old-address" },
    { assets: {} },
  ])(
    "rejects foreign, stale, incomplete or already bound preparation: %o",
    async (patch) => {
      const scenario = shippedScenario();
      const pack = { ...prepared(scenario), ...patch };
      const { repository, inserts, auditLog } = createRepository([
        [],
        [],
        [pack],
      ]);
      await expect(
        repository.publish({
          scenario,
          authorId: "instructor-1",
          authoringSource: "manual",
          preparationId: pack.id,
        }),
      ).rejects.toThrow();
      expect(
        inserts.filter((insert) => insert.table === scenarioAudioPacks),
      ).toHaveLength(0);
      expect(auditLog.log).not.toHaveBeenCalled();
    },
  );
});

describe(`${DrizzleScenarioAuthoringRepository.name} publishVersion`, () => {
  it("publishes the next version with a persona of its own", async () => {
    const scenario = shippedScenario();
    const { repository, inserts, updates, auditLog } = createRepository([
      [{ id: SCENARIO_ID, code: scenario.code, status: "published" }],
      [{ id: BASE_VERSION_ID, version: 3 }],
      [],
    ]);

    const published = await repository.publishVersion(
      editInput({ ...scenario, title: "Пожар в подъезде жилого дома" }),
    );

    expect(published).toMatchObject({
      scenarioId: SCENARIO_ID,
      code: scenario.code,
      title: "Пожар в подъезде жилого дома",
      version: 4,
      status: "published",
    });

    const persona = inserts.find((insert) => insert.table === callerPersonas);
    const version = inserts.find((insert) => insert.table === scenarioVersions);
    expect(
      inserts.find((insert) => insert.table === scenarioAudioPacks)?.values,
    ).toEqual({
      scenarioVersionId: published.scenarioVersionId,
    });

    // Прошлые версии не трогаются: персонаж пишется новой строкой и
    // привязывается к новой версии.
    expect(persona?.values).toMatchObject({ code: scenario.persona.code });
    expect(version?.values).toMatchObject({
      id: published.scenarioVersionId,
      version: 4,
      personaId: (persona?.values as { id: string }).id,
      publishedBy: "instructor-1",
    });
    expect(inserts.some((insert) => insert.table === scenarioLocations)).toBe(
      true,
    );
    expect(updates).toEqual([
      {
        table: scenarios,
        values: expect.objectContaining({
          title: "Пожар в подъезде жилого дома",
        }),
      },
    ]);
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "scenario.publish",
        resourceId: published.scenarioVersionId,
        details: expect.objectContaining({
          version: 4,
          baseVersionId: BASE_VERSION_ID,
        }),
      }),
      expect.anything(),
    );
  });

  it("refuses an edit made on top of a version that is no longer the latest", async () => {
    const scenario = shippedScenario();
    const { repository, inserts, updates } = createRepository([
      [{ id: SCENARIO_ID, code: scenario.code, status: "published" }],
      [{ id: "a-newer-version", version: 4 }],
    ]);

    await expect(repository.publishVersion(editInput())).rejects.toEqual(
      new ScenarioAuthoringConflictError("stale-version"),
    );
    // Отказ до записи: чужая свежая версия остаётся последней.
    expect(inserts).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("refuses an edit that renames the scenario code", async () => {
    const { repository, inserts } = createRepository([
      [{ id: SCENARIO_ID, code: "S-999", status: "published" }],
    ]);

    await expect(repository.publishVersion(editInput())).rejects.toEqual(
      new ScenarioAuthoringConflictError("code-changed"),
    );
    expect(inserts).toEqual([]);
  });

  it("refuses a persona code that belongs to another scenario", async () => {
    const scenario = shippedScenario();
    const { repository, inserts } = createRepository([
      [{ id: SCENARIO_ID, code: scenario.code, status: "published" }],
      [{ id: BASE_VERSION_ID, version: 1 }],
      [{ id: "someone-elses-persona" }],
    ]);

    await expect(repository.publishVersion(editInput())).rejects.toEqual(
      new ScenarioAuthoringConflictError("persona-code"),
    );
    expect(inserts).toEqual([]);
  });

  it("reports a scenario that does not exist", async () => {
    const { repository } = createRepository([[]]);

    await expect(repository.publishVersion(editInput())).rejects.toBeInstanceOf(
      ScenarioNotFoundError,
    );
  });

  it("does not bring a removed scenario back through an edit", async () => {
    const scenario = shippedScenario();
    const { repository, inserts, updates } = createRepository([
      [{ id: SCENARIO_ID, code: scenario.code, status: "archived" }],
    ]);

    await expect(repository.publishVersion(editInput())).rejects.toBeInstanceOf(
      ScenarioNotFoundError,
    );
    expect(inserts).toEqual([]);
    expect(updates).toEqual([]);
  });
});

describe(`${DrizzleScenarioAuthoringRepository.name} loadVersion`, () => {
  const storedRows = (scenario: ScenarioSeed) =>
    toScenarioVersionRows({
      scenarioId: SCENARIO_ID,
      scenarioVersionId: BASE_VERSION_ID,
      personaId: "persona-1",
      version: 2,
      scenario,
      authorId: "instructor-1",
      authoringSource: "manual",
      publishedAt: new Date("2026-09-14T10:00:00.000Z"),
      generateId: () => "row",
    });

  const versionRow = (scenario: ScenarioSeed) => {
    const rows = storedRows(scenario);

    return {
      version: {
        ...rows.version,
        referenceNotes: rows.version.referenceNotes ?? null,
        authoringSource: "manual",
      },
      scenario: { ...scenario, id: SCENARIO_ID },
      persona: rows.persona,
    };
  };

  it("returns the complete version and whether it is still the latest", async () => {
    const scenario = shippedScenario();
    const rows = storedRows(scenario);
    const { repository } = createRepository([
      [versionRow(scenario)],
      [rows.location],
      rows.facts,
      rows.escalationRules,
      rows.mandatoryQuestions,
      rows.referenceCardFields,
      [{ version: 3 }],
    ]);

    const loaded = await repository.loadVersion(BASE_VERSION_ID);

    expect(loaded).toMatchObject({
      scenarioId: SCENARIO_ID,
      scenarioVersionId: BASE_VERSION_ID,
      version: 2,
      isLatest: false,
      publishedAt: "2026-09-14T10:00:00.000Z",
    });
    expect(loaded?.scenario.persona).toEqual(scenario.persona);
    expect(loaded?.scenario.facts).toEqual(scenario.facts);
    expect(loaded?.issues).toEqual([]);
  });

  it("finds nothing for an unknown or unpublished version", async () => {
    const { repository } = createRepository([[]]);

    await expect(repository.loadVersion(BASE_VERSION_ID)).resolves.toBeNull();
  });
});

describe(`${DrizzleScenarioAuthoringRepository.name} publish`, () => {
  it("refuses a persona code another scenario already uses", async () => {
    const { repository, inserts } = createRepository([
      [],
      [{ id: "someone-elses-persona" }],
    ]);

    await expect(
      repository.publish({
        scenario: shippedScenario(),
        authorId: "instructor-1",
        authoringSource: "manual",
      }),
    ).rejects.toEqual(new ScenarioAuthoringConflictError("persona-code"));
    expect(inserts).toEqual([]);
  });
});

describe(`${DrizzleScenarioAuthoringRepository.name} archive`, () => {
  it("takes the scenario off the catalog without deleting its versions", async () => {
    const { repository, inserts, updates, auditLog } = createRepository([
      [{ id: SCENARIO_ID, code: "S-015", status: "published" }],
    ]);

    await expect(
      repository.archive({ scenarioId: SCENARIO_ID, actorId: "instructor-1" }),
    ).resolves.toBe("archived");

    // Версии остаются: на них ссылаются проведённые звонки и их разборы.
    expect(inserts).toEqual([]);
    expect(updates).toEqual([
      {
        table: scenarios,
        values: expect.objectContaining({ status: "archived" }),
      },
    ]);
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "instructor-1",
        action: "scenario.archive",
        resourceId: SCENARIO_ID,
        details: { code: "S-015", previousStatus: "published" },
      }),
      expect.anything(),
    );
  });

  it("changes nothing when the scenario is already removed", async () => {
    const { repository, updates, auditLog } = createRepository([
      [{ id: SCENARIO_ID, code: "S-015", status: "archived" }],
    ]);

    await expect(
      repository.archive({ scenarioId: SCENARIO_ID, actorId: "instructor-1" }),
    ).resolves.toBe("already-archived");
    expect(updates).toEqual([]);
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it("reports a scenario that does not exist", async () => {
    const { repository } = createRepository([[]]);

    await expect(
      repository.archive({ scenarioId: SCENARIO_ID, actorId: "instructor-1" }),
    ).rejects.toBeInstanceOf(ScenarioNotFoundError);
  });
});
