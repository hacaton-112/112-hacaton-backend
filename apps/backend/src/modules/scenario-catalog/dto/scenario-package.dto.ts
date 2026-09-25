import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { ScenarioSeedSchema } from "@/modules/scenario-engine/domain/scenario-seed.schema";

export const ScenarioExportQuerySchema = z.object({
  ids: z.string().trim().optional(),
});

export class ScenarioExportQueryDto extends createZodDto(
  ScenarioExportQuerySchema,
) {}

export const ScenarioPackageSchema = z.object({
  formatVersion: z.literal(1),
  exportedAt: z.iso.datetime(),
  scenarios: z.array(ScenarioSeedSchema),
});

export class ScenarioPackageDto extends createZodDto(ScenarioPackageSchema) {}

export const ScenarioImportReportSchema = z.object({
  dryRun: z.boolean(),
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  entries: z.array(
    z.object({
      code: z.string(),
      outcome: z.enum(["created", "updated", "rejected"]),
      reason: z.string().nullable(),
    }),
  ),
});

export class ScenarioImportReportDto extends createZodDto(
  ScenarioImportReportSchema,
) {}

export type ScenarioImportReport = z.infer<typeof ScenarioImportReportSchema>;
