import {
  DISPATCH_SERVICES,
  type DispatchService,
} from "@/drizzle/schema";

export const WORKSTATION_FORMATS = ["xml", "csv"] as const;
export type WorkstationFormat = (typeof WORKSTATION_FORMATS)[number];

export interface WorkstationConfigurationRow {
  readonly name: string;
  readonly service: DispatchService;
  readonly assignedUser: string | null;
  readonly extension: string;
  readonly active: boolean;
}

export interface WorkstationConfigurationIssue {
  readonly row: number;
  readonly extension: string | null;
  readonly reason: string;
}

export interface ParsedWorkstationConfiguration {
  readonly rows: readonly WorkstationConfigurationRow[];
  readonly issues: readonly WorkstationConfigurationIssue[];
}

const SERVICES = new Set<string>(DISPATCH_SERVICES);
const EXTENSION = /^\d{2,6}$/u;
const HEADERS = ["name", "service", "assignedUser", "extension", "active"];

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const decodeXml = (value: string) =>
  value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");

const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;

export function serializeWorkstationConfiguration(
  rows: readonly WorkstationConfigurationRow[],
  format: WorkstationFormat,
): string {
  if (format === "csv") {
    const lines = [
      HEADERS.join(";"),
      ...rows.map((row) =>
        [
          row.name,
          row.service,
          row.assignedUser ?? "",
          row.extension,
          row.active ? "true" : "false",
        ]
          .map(csvCell)
          .join(";"),
      ),
    ];
    return `\uFEFF${lines.join("\r\n")}\r\n`;
  }

  const items = rows
    .map(
      (row) => `  <workstation>
    <name>${escapeXml(row.name)}</name>
    <service>${row.service}</service>
    <assignedUser>${escapeXml(row.assignedUser ?? "")}</assignedUser>
    <extension>${row.extension}</extension>
    <active>${row.active}</active>
  </workstation>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<workstations>\n${items}\n</workstations>\n`;
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = content.replace(/^\uFEFF/u, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === ";" && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function rawRows(content: string, format: WorkstationFormat): string[][] {
  if (format === "csv") {
    const [headers = [], ...rows] = parseCsv(content);
    if (headers.join(";") !== HEADERS.join(";")) return [];
    return rows;
  }

  return [...content.matchAll(/<workstation>([\s\S]*?)<\/workstation>/gu)].map(
    ([, body]) =>
      HEADERS.map((header) => {
        const match = body.match(
          new RegExp(`<${header}>([\\s\\S]*?)<\\/${header}>`, "u"),
        );
        return decodeXml(match?.[1]?.trim() ?? "");
      }),
  );
}

export function parseWorkstationConfiguration(
  content: string,
  format: WorkstationFormat,
): ParsedWorkstationConfiguration {
  const rows: WorkstationConfigurationRow[] = [];
  const issues: WorkstationConfigurationIssue[] = [];
  const extensions = new Set<string>();
  const source = rawRows(content, format);

  if (source.length === 0) {
    return {
      rows,
      issues: [{ row: 1, extension: null, reason: "Файл пуст или имеет неверные заголовки" }],
    };
  }

  source.forEach(([name = "", service = "", assignedUser = "", extension = "", active = ""], index) => {
    const row = index + 2;
    let reason: string | null = null;
    if (name.trim() === "") reason = "Не указано название рабочего места";
    else if (!SERVICES.has(service)) reason = `Неизвестная служба: ${service || "не указана"}`;
    else if (!EXTENSION.test(extension)) reason = "Внутренний номер должен содержать от 2 до 6 цифр";
    else if (extensions.has(extension)) reason = `Внутренний номер ${extension} повторяется в файле`;
    else if (!["true", "false", "1", "0", "да", "нет"].includes(active.toLowerCase())) reason = "Признак активности должен быть true/false, 1/0 или да/нет";

    if (reason) {
      issues.push({ row, extension: extension || null, reason });
      return;
    }
    extensions.add(extension);
    rows.push({
      name: name.trim(),
      service: service as DispatchService,
      assignedUser: assignedUser.trim() || null,
      extension,
      active: ["true", "1", "да"].includes(active.toLowerCase()),
    });
  });
  return { rows, issues };
}
