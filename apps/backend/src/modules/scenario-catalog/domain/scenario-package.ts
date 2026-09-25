import { z } from "zod";

import {
  ScenarioSeedSchema,
  type ScenarioSeed,
} from "@/modules/scenario-engine/domain/scenario-seed.schema";

export const SCENARIO_PACKAGE_FORMAT_VERSION = 1 as const;

export interface ScenarioPackageIssue {
  readonly code: string;
  readonly reason: string;
}

export interface ParsedScenarioPackage {
  readonly formatVersion: typeof SCENARIO_PACKAGE_FORMAT_VERSION;
  readonly exportedAt: string;
  readonly scenarios: readonly ScenarioSeed[];
  readonly issues: readonly ScenarioPackageIssue[];
}

const HeaderSchema = z
  .object({
    formatVersion: z.literal(SCENARIO_PACKAGE_FORMAT_VERSION),
    exportedAt: z.iso.datetime(),
    scenarios: z.array(z.unknown()),
  })
  .strict();

const codeFrom = (value: unknown, index: number): string => {
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { code?: unknown }).code === "string"
  )
    return (value as { code: string }).code.trim() || `запись ${index + 1}`;
  return `запись ${index + 1}`;
};

const russianReason = (error: z.ZodError): string => {
  const issue = error.issues[0];
  if (!issue) return "Запись не соответствует схеме сценария";
  const path = issue.path.length > 0 ? issue.path.join(".") : "сценарий";
  if (path === "category") return "Неизвестная категория сценария";
  return `Поле «${path}» заполнено неверно или отсутствует`;
};

/**
 * Сначала разбирает весь недоверенный файл и только возвращает результат.
 * Запись в БД выполняется отдельным шагом, поэтому частично проверенный пакет
 * никогда не может попасть в хранилище.
 */
export function parseScenarioPackage(input: unknown): ParsedScenarioPackage {
  const header = HeaderSchema.safeParse(input);
  if (!header.success) {
    return {
      formatVersion: SCENARIO_PACKAGE_FORMAT_VERSION,
      exportedAt: new Date(0).toISOString(),
      scenarios: [],
      issues: [
        {
          code: "пакет",
          reason: "Формат или версия файла не поддерживается",
        },
      ],
    };
  }
  if (header.data.scenarios.length === 0) {
    return {
      ...header.data,
      scenarios: [],
      issues: [{ code: "пакет", reason: "Файл не содержит сценариев" }],
    };
  }

  const counts = new Map<string, number>();
  header.data.scenarios.forEach((value, index) => {
    const code = codeFrom(value, index);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  });
  const scenarios: ScenarioSeed[] = [];
  const issues: ScenarioPackageIssue[] = [];
  header.data.scenarios.forEach((value, index) => {
    const code = codeFrom(value, index);
    if ((counts.get(code) ?? 0) > 1) {
      issues.push({
        code,
        reason: `Код сценария «${code}» повторяется в файле`,
      });
      return;
    }
    const parsed = ScenarioSeedSchema.safeParse(value);
    if (!parsed.success) {
      issues.push({ code, reason: russianReason(parsed.error) });
      return;
    }
    scenarios.push(parsed.data);
  });

  return { ...header.data, scenarios, issues };
}

export function buildScenarioPackage(
  scenarios: readonly ScenarioSeed[],
  exportedAt = new Date(),
) {
  return {
    formatVersion: SCENARIO_PACKAGE_FORMAT_VERSION,
    exportedAt: exportedAt.toISOString(),
    scenarios: [...scenarios],
  };
}
