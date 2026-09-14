import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { desc, eq } from "drizzle-orm";

import { generateId } from "@/common/utils/id";
import { type Database, db, pool } from "@/core/database/drizzle.client";
import {
  callerPersonas,
  escalationRules,
  mandatoryQuestions,
  referenceCardFields,
  scenarioFacts,
  scenarioLocations,
  scenarios,
  scenarioVersions,
} from "@/drizzle/schema";
import {
  ScenarioSeedSchema,
  type ScenarioSeed,
} from "@/modules/scenario-engine/domain/scenario-seed.schema";

/**
 * Заливает демонстрационные сценарии из JSON в базу.
 *
 *   bun run db:seed
 *
 * Файл — исходник версии, а не формат исполнения: движок читает только базу.
 * Изменённый файл публикуется новой версией, а не заменяет старую: на
 * прошлые версии ссылаются проведённые звонки, и история занятия важнее
 * удобства загрузчика. Неизменившийся файл не делает ничего.
 */
// Путь от корня проекта: сборка идёт в CommonJS, где import.meta недоступен.
const SCENARIOS_DIR = join(process.cwd(), "drizzle", "seed", "scenarios");

/**
 * Отпечаток сценария считается по разобранному значению, а не по тексту файла:
 * иначе новая версия рождалась бы от переставленного пробуна.
 */
const fingerprint = (seed: ScenarioSeed): string =>
  createHash("sha256").update(stableJson(seed)).digest("hex");

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));

    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "null";
};

const seedScenario = async (
  database: Database,
  seed: ScenarioSeed,
): Promise<void> => {
  const seedHash = fingerprint(seed);

  await database.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: scenarios.id })
      .from(scenarios)
      .where(eq(scenarios.code, seed.code))
      .limit(1);

    const [latest] = existing
      ? await tx
          .select({
            version: scenarioVersions.version,
            seedHash: scenarioVersions.seedHash,
          })
          .from(scenarioVersions)
          .where(eq(scenarioVersions.scenarioId, existing.id))
          .orderBy(desc(scenarioVersions.version))
          .limit(1)
      : [];

    if (latest && latest.seedHash === seedHash) {
      console.log(`${seed.code} · без изменений, версия ${latest.version}`);

      return;
    }

    // Персонаж входит в снимок версии: прошлые версии продолжают звучать тем
    // голосом и той манерой, с которыми по ним проводились звонки.
    const [persona] = await tx
      .insert(callerPersonas)
      .values({
        id: generateId(),
        code: seed.persona.code,
        displayName: seed.persona.displayName,
        gender: seed.persona.gender,
        ageYears: seed.persona.ageYears,
        condition: seed.persona.condition,
        speechStyle: seed.persona.speechStyle,
        backgroundSounds: seed.persona.backgroundSounds ?? null,
        voiceId: seed.persona.voiceId,
        baselinePanicLevel: seed.persona.baselinePanicLevel,
        baseSpeechRate: seed.persona.baseSpeechRate.toFixed(2),
      })
      .returning({ id: callerPersonas.id });

    const scenarioId = existing?.id ?? generateId();
    const versionId = generateId();
    const version = (latest?.version ?? 0) + 1;
    const now = new Date();

    if (existing) {
      // Код остаётся тем же сценарием: меняется его описание, а не личность.
      await tx
        .update(scenarios)
        .set({
          title: seed.title,
          category: seed.category,
          difficulty: seed.difficulty,
          summary: seed.summary,
          status: "published",
          updatedAt: now,
        })
        .where(eq(scenarios.id, scenarioId));
    } else {
      await tx.insert(scenarios).values({
        id: scenarioId,
        code: seed.code,
        title: seed.title,
        category: seed.category,
        difficulty: seed.difficulty,
        summary: seed.summary,
        status: "published",
      });
    }

    await tx.insert(scenarioVersions).values({
      id: versionId,
      scenarioId,
      version,
      personaId: persona.id,
      panicFloor: seed.version.panicFloor,
      panicCeiling: seed.version.panicCeiling,
      maxInterruptions: seed.version.maxInterruptions,
      initiativeCooldownSeconds: seed.version.initiativeCooldownSeconds,
      answerNormSeconds: seed.version.answerNormSeconds,
      expectedDurationSeconds: seed.version.expectedDurationSeconds,
      passThreshold: seed.version.passThreshold,
      expectedServices: seed.version.expectedServices,
      referenceNotes: seed.referenceCard.notes ?? null,
      openingLine: seed.version.openingLine,
      fallbackLine: seed.version.fallbackLine,
      authoringSource: "manual",
      seedHash,
      publishedAt: now,
      reviewedAt: now,
    });

    await tx.insert(scenarioLocations).values({
      scenarioVersionId: versionId,
      terrain: seed.location.terrain,
      exactAddress: seed.location.exactAddress,
      exactLat: seed.location.exactPoint[0].toFixed(6),
      exactLon: seed.location.exactPoint[1].toFixed(6),
      locatorCenterLat: seed.location.locatorCenter[0].toFixed(6),
      locatorCenterLon: seed.location.locatorCenter[1].toFixed(6),
      locatorRadiusMeters: seed.location.locatorRadiusMeters,
      locatorLabel: seed.location.locatorLabel,
      locatorAccuracy: seed.location.locatorAccuracy,
      callerNumber: seed.location.callerNumber,
      previouslyCalled: seed.location.previouslyCalled,
    });

    await tx.insert(scenarioFacts).values(
      seed.facts.map((fact, index) => ({
        id: generateId(),
        scenarioVersionId: versionId,
        key: fact.key,
        promptValue: fact.promptValue,
        displayLabel: fact.displayLabel,
        severity: fact.severity,
        cardField: fact.cardField,
        cardValue: fact.cardValue,
        contentKeywords: fact.contentKeywords,
        disclosure: fact.disclosure,
        priority: fact.priority,
        orderIndex: index,
      })),
    );

    if (seed.escalation.length > 0) {
      await tx.insert(escalationRules).values(
        seed.escalation.map((rule) => ({
          id: generateId(),
          scenarioVersionId: versionId,
          trigger: rule.trigger,
          direction: rule.direction,
          cooldownSeconds: rule.cooldownSeconds,
          params: rule.params ?? null,
        })),
      );
    }

    if (seed.mandatoryQuestions.length > 0) {
      await tx.insert(mandatoryQuestions).values(
        seed.mandatoryQuestions.map((question, index) => ({
          id: generateId(),
          scenarioVersionId: versionId,
          orderIndex: index,
          text: question.text,
          satisfiedByFactKeys: question.satisfiedByFactKeys,
          isCritical: question.isCritical,
        })),
      );
    }

    if (seed.referenceCard.fields.length > 0) {
      await tx.insert(referenceCardFields).values(
        seed.referenceCard.fields.map((field) => ({
          id: generateId(),
          scenarioVersionId: versionId,
          field: field.field,
          expectedValue: field.expectedValue,
          acceptableValues: field.acceptableValues,
          comparison: field.comparison,
          isRequired: field.isRequired,
          sourceFactKey: field.sourceFactKey,
        })),
      );
    }

    console.log(
      existing
        ? `${seed.code} · ${seed.title} — опубликована версия ${version}, фактов ${seed.facts.length}; прошлые версии остались за проведёнными звонками`
        : `${seed.code} · ${seed.title} — версия ${version}, фактов ${seed.facts.length}`,
    );
  });
};

async function main(): Promise<void> {
  const files = (await readdir(SCENARIOS_DIR)).filter((name) =>
    name.endsWith(".json"),
  );

  if (files.length === 0) {
    throw new Error(`No scenario files found in ${SCENARIOS_DIR}`);
  }

  try {
    for (const file of files) {
      const raw: unknown = JSON.parse(
        await readFile(join(SCENARIOS_DIR, file), "utf8"),
      );
      // Та же схема, что проверяет ручной ввод: сценарий с несуществующим
      // ключом факта не должен доехать до базы.
      await seedScenario(db, ScenarioSeedSchema.parse(raw));
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
