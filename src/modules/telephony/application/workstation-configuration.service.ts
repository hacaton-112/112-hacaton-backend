import { Injectable } from "@nestjs/common";

import { AuditLogService } from "@/modules/audit-log/application/audit-log.service";

import {
  parseWorkstationConfiguration,
  serializeWorkstationConfiguration,
  type WorkstationFormat,
} from "../domain/workstation-configuration";
import { DrizzleTelephonyDirectory } from "../infrastructure/drizzle-telephony.directory";

export interface WorkstationImportReport {
  readonly dryRun: boolean;
  readonly rows: readonly {
    readonly row: number;
    readonly extension: string | null;
    readonly status: "created" | "updated" | "rejected";
    readonly reason: string | null;
  }[];
}

@Injectable()
export class WorkstationConfigurationService {
  constructor(
    private readonly directory: DrizzleTelephonyDirectory,
    private readonly audit: AuditLogService,
  ) {}

  async export(format: WorkstationFormat): Promise<string> {
    const workstations = await this.directory.listWorkstations();
    return serializeWorkstationConfiguration(
      workstations.map((item) => ({
        name: item.name,
        service: item.service,
        assignedUser: item.email,
        extension: item.extension,
        active: item.isActive,
      })),
      format,
    );
  }

  async import(
    content: string,
    format: WorkstationFormat,
    dryRun: boolean,
    actorId: string,
  ): Promise<WorkstationImportReport> {
    const parsed = parseWorkstationConfiguration(content, format);
    const current = new Map(
      (await this.directory.listWorkstations()).map((item) => [item.extension, item]),
    );
    const report: WorkstationImportReport["rows"][number][] = parsed.issues.map(
      (issue) => ({ ...issue, status: "rejected" as const }),
    );

    for (const [index, row] of parsed.rows.entries()) {
      const user = row.assignedUser
        ? await this.directory.findUserByEmail(row.assignedUser)
        : null;
      if (row.assignedUser && !user) {
        report.push({
          row: index + 2,
          extension: row.extension,
          status: "rejected",
          reason: `Пользователь ${row.assignedUser} не найден`,
        });
        continue;
      }

      const status = current.has(row.extension) ? "updated" : "created";
      if (!dryRun) {
        await this.directory.saveWorkstation({
          extension: row.extension,
          name: row.name,
          service: row.service,
          userId: user?.id ?? null,
          isActive: row.active,
        });
      }
      report.push({ row: index + 2, extension: row.extension, status, reason: null });
    }

    report.sort((left, right) => left.row - right.row);
    await this.audit.log({
      actorId,
      action: dryRun ? "admin.workstations.import_validated" : "admin.workstations.imported",
      resource: "telephony_workstations",
      details: {
        format,
        created: report.filter(({ status }) => status === "created").length,
        updated: report.filter(({ status }) => status === "updated").length,
        rejected: report.filter(({ status }) => status === "rejected").length,
      },
    });
    return { dryRun, rows: report };
  }
}
