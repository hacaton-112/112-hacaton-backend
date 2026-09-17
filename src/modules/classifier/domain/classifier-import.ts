import { createHash } from "node:crypto";

import type {
  ClassifierImportWarning,
  ClassifierRuleMode,
} from "@/drizzle/schema";

import type { ClassifierWorkbookCell } from "../ports/classifier-workbook-reader.port";

const SHEET_NAME = "Лист1";
const HEADER_ROWS = 3;
const EXPECTED_COLUMNS = 99;
const FIRST_SERVICE_COLUMN = 13;

export interface ParsedClassifierRoute {
  readonly serviceCode: string;
  readonly serviceName: string;
  readonly sourceHeader: string;
  readonly mode: ClassifierRuleMode;
  readonly qualifierCode: string | null;
  readonly qualifierLabel: string | null;
  readonly routeLabel: string;
  readonly sourceColumn: string;
  readonly orderIndex: number;
}

export interface ParsedClassifierEntry {
  readonly sourceCode: string;
  readonly sourceRow: number;
  readonly groupName: string | null;
  readonly statisticalGroup: string | null;
  readonly feature1: string;
  readonly feature2: string | null;
  readonly feature3: string | null;
  readonly additionalSigns: string | null;
  readonly finalType: string;
  readonly ekpType: string | null;
  readonly mainServiceCode: string | null;
  readonly operatorVisible: boolean;
  readonly routes: readonly ParsedClassifierRoute[];
}

export interface ParsedClassifierWorkbook {
  readonly sheetName: string;
  readonly entries: readonly ParsedClassifierEntry[];
  readonly warnings: readonly ClassifierImportWarning[];
}

export interface ClassifierImportIssue {
  readonly row: number;
  readonly column: string;
  readonly message: string;
}

export class ClassifierImportError extends Error {
  constructor(public readonly issues: readonly ClassifierImportIssue[]) {
    super("Classifier workbook is invalid");
    this.name = ClassifierImportError.name;
  }
}

interface ServiceColumn {
  readonly index: number;
  readonly sourceColumn: string;
  readonly serviceCode: string;
  readonly serviceName: string;
  readonly sourceHeader: string;
  readonly mode: ClassifierRuleMode;
  readonly qualifierCode: string | null;
  readonly qualifierLabel: string | null;
}

const text = (value: ClassifierWorkbookCell | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
};

const comparable = (value: string): string =>
  value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();

const stableCode = (prefix: "svc" | "q", value: string): string =>
  `${prefix}_${createHash("sha256").update(comparable(value)).digest("hex").slice(0, 12)}`;

const columnName = (zeroBased: number): string => {
  let value = zeroBased + 1;
  let result = "";

  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }

  return result;
};

const isConditionLabel = (value: string): boolean => {
  const label = comparable(value);
  return [
    "признак",
    "выбран",
    "не выбран",
    "не выбраны",
    "угроза",
    "постр",
    "погиб",
    "эвакуац",
    "газификац",
    "перекрытие",
    "тоннель",
    "пеш",
    "стройка",
    "объект из перечня",
    "реагирование всегда",
    "на объектах",
    ">5 чел",
  ].some((fragment) => label.includes(fragment));
};

const conditionMode = (label: string | null): ClassifierRuleMode => {
  if (label === null || comparable(label).includes("реагирование всегда")) {
    return "always";
  }

  const normalized = comparable(label);
  return normalized.includes("не выбран") || normalized.includes("не выбраны")
    ? "default"
    : "selected";
};

const validateHeaders = (
  rows: readonly (readonly ClassifierWorkbookCell[])[],
): readonly ClassifierImportIssue[] => {
  const issues: ClassifierImportIssue[] = [];

  if (rows.length <= HEADER_ROWS) {
    return [
      { row: 1, column: "A", message: "Workbook has no classifier rows" },
    ];
  }

  const width = Math.max(
    ...rows.slice(0, HEADER_ROWS).map((row) => row.length),
  );
  if (width !== EXPECTED_COLUMNS) {
    issues.push({
      row: 1,
      column: "A:CU",
      message: `Expected ${EXPECTED_COLUMNS} columns, received ${width}`,
    });
  }

  const required = [
    { row: 1, column: 12, value: "Главная служба" },
    { row: 2, column: 4, value: "Номер" },
    { row: 2, column: 6, value: "112 - Признак.1 (тип происшествия)" },
    { row: 2, column: 10, value: "Итоговый тип происшествия" },
  ] as const;

  for (const expected of required) {
    const actual = text(rows[expected.row - 1]?.[expected.column]);
    if (actual === null || comparable(actual) !== comparable(expected.value)) {
      issues.push({
        row: expected.row,
        column: columnName(expected.column),
        message: `Expected header “${expected.value}”`,
      });
    }
  }

  return issues;
};

const serviceColumns = (
  rows: readonly (readonly ClassifierWorkbookCell[])[],
): readonly ServiceColumn[] => {
  const columns: ServiceColumn[] = [];
  let topHeader: string | null = null;
  let secondHeader: string | null = null;

  for (let index = FIRST_SERVICE_COLUMN; index < EXPECTED_COLUMNS; index += 1) {
    const rawTop = text(rows[0]?.[index]);
    if (rawTop !== null) {
      topHeader = rawTop;
      secondHeader = null;
    }

    const rawSecond = text(rows[1]?.[index]);
    if (rawSecond !== null) secondHeader = rawSecond;

    if (topHeader === null) continue;

    const thirdHeader = text(rows[2]?.[index]);
    const qualifierLabel =
      thirdHeader ??
      (rawSecond !== null && isConditionLabel(rawSecond) ? rawSecond : null);
    const specificService =
      comparable(topHeader) === comparable("Классификатор МЧС") &&
      secondHeader !== null &&
      !isConditionLabel(secondHeader)
        ? secondHeader
        : topHeader;
    const sourceHeader = [
      topHeader,
      specificService === topHeader ? null : specificService,
    ]
      .filter((value): value is string => value !== null)
      .join(" / ");
    const mode = conditionMode(qualifierLabel);

    columns.push({
      index,
      sourceColumn: columnName(index),
      serviceCode: stableCode("svc", specificService),
      serviceName: specificService,
      sourceHeader,
      mode,
      qualifierCode:
        mode === "selected" && qualifierLabel !== null
          ? stableCode("q", qualifierLabel)
          : null,
      qualifierLabel: mode === "selected" ? qualifierLabel : null,
    });
  }

  return columns;
};

export const parseClassifierWorkbook = (
  rows: readonly (readonly ClassifierWorkbookCell[])[],
): ParsedClassifierWorkbook => {
  const issues = [...validateHeaders(rows)];
  if (issues.length > 0) throw new ClassifierImportError(issues);

  const columns = serviceColumns(rows);
  const entries: ParsedClassifierEntry[] = [];
  const warnings: ClassifierImportWarning[] = [];
  const sourceCodes = new Set<string>();
  let groupName: string | null = null;

  for (let index = HEADER_ROWS; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const excelRow = index + 1;
    const finalType = text(row[10]);

    if (finalType === null) {
      groupName = text(row[5]) ?? groupName;
      continue;
    }

    const sourceCode = text(row[4]);
    const feature1 = text(row[6]);

    if (sourceCode === null) {
      issues.push({
        row: excelRow,
        column: "E",
        message: "Source code is required",
      });
      continue;
    }
    if (sourceCodes.has(sourceCode)) {
      issues.push({
        row: excelRow,
        column: "E",
        message: `Duplicate source code ${sourceCode}`,
      });
      continue;
    }
    if (feature1 === null) {
      issues.push({
        row: excelRow,
        column: "G",
        message: "First classifier feature is required",
      });
      continue;
    }

    sourceCodes.add(sourceCode);
    const ekpType = text(row[11]);
    const mainServiceCode = text(row[12]);

    if (ekpType === null) {
      warnings.push({
        code: "missing_ekp_type",
        row: excelRow,
        column: "L",
        message: `Entry ${sourceCode} has no EKP type`,
      });
    }
    if (mainServiceCode === null) {
      warnings.push({
        code: "missing_main_service",
        row: excelRow,
        column: "M",
        message: `Entry ${sourceCode} has no main service`,
      });
    }

    const routes = columns.flatMap((column, orderIndex) => {
      const routeLabel = text(row[column.index]);
      if (routeLabel === null) return [];

      return [
        {
          serviceCode: column.serviceCode,
          serviceName: column.serviceName,
          sourceHeader: column.sourceHeader,
          mode: column.mode,
          qualifierCode: column.qualifierCode,
          qualifierLabel: column.qualifierLabel,
          routeLabel,
          sourceColumn: column.sourceColumn,
          orderIndex,
        } satisfies ParsedClassifierRoute,
      ];
    });

    entries.push({
      sourceCode,
      sourceRow: excelRow,
      groupName,
      statisticalGroup: text(row[5]),
      feature1,
      feature2: text(row[7]),
      feature3: text(row[8]),
      additionalSigns: text(row[9]),
      finalType,
      ekpType,
      mainServiceCode,
      operatorVisible:
        comparable(feature1) !== comparable("Не отображается оператору 112"),
      routes,
    });
  }

  if (issues.length > 0) throw new ClassifierImportError(issues);
  if (entries.length === 0) {
    throw new ClassifierImportError([
      {
        row: 4,
        column: "K",
        message: "Workbook contains no classifier entries",
      },
    ]);
  }

  return { sheetName: SHEET_NAME, entries, warnings };
};

export const CLASSIFIER_SHEET_NAME = SHEET_NAME;
