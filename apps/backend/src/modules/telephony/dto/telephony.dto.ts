import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { DISPATCH_SERVICES } from "@/drizzle/schema";

/** Внутренний номер учебной АТС: короткий и только из цифр. */
export const ExtensionSchema = z.string().regex(/^\d{2,6}$/u);

export const RescueCrewListSchema = z
  .object({
    crews: z.array(
      z
        .object({
          id: z.string().min(1),
          service: z.enum(DISPATCH_SERVICES),
          callsign: z.string().min(1),
          phoneNumber: z.string().min(1),
          voiceId: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();

export const TelephonyWorkstationListSchema = z
  .object({
    workstations: z.array(
      z
        .object({
          extension: ExtensionSchema,
          name: z.string().min(1),
          service: z.enum(DISPATCH_SERVICES),
          userId: z.string().min(1).nullable(),
          fullName: z.string().min(1).nullable(),
          email: z.email().nullable(),
          isActive: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();

export const BindWorkstationRequestSchema = z
  .object({ userId: z.string().trim().min(1) })
  .strict();

export class RescueCrewListDto extends createZodDto(RescueCrewListSchema) {}
export class TelephonyWorkstationListDto extends createZodDto(
  TelephonyWorkstationListSchema,
) {}
export class BindWorkstationRequestDto extends createZodDto(
  BindWorkstationRequestSchema,
) {}

export const WorkstationExportQuerySchema = z.object({
  format: z.enum(["xml", "csv"]),
});

export const WorkstationImportRequestSchema = z.object({
  format: z.enum(["xml", "csv"]),
  content: z.string().min(1).max(2_000_000),
  dryRun: z.boolean().default(false),
});

export const WorkstationImportReportSchema = z.object({
  dryRun: z.boolean(),
  rows: z.array(
    z.object({
      row: z.number().int().positive(),
      extension: z.string().nullable(),
      status: z.enum(["created", "updated", "rejected"]),
      reason: z.string().nullable(),
    }),
  ),
});

export class WorkstationExportQueryDto extends createZodDto(
  WorkstationExportQuerySchema,
) {}
export class WorkstationImportRequestDto extends createZodDto(
  WorkstationImportRequestSchema,
) {}
export class WorkstationImportReportDto extends createZodDto(
  WorkstationImportReportSchema,
) {}

export const StartCrewCallRequestSchema = z
  .object({
    eventId: z.uuid(),
    dialedNumber: ExtensionSchema,
  })
  .strict();

export const CrewCallCommandSchema = z
  .object({
    eventId: z.uuid(),
    exerciseId: z.uuid(),
    dialedNumber: ExtensionSchema,
    workstationExtension: ExtensionSchema,
    state: z.literal("ringing"),
  })
  .strict();

export const BrowserPhoneConfigSchema = z
  .object({
    extension: ExtensionSchema,
    aor: z.string().startsWith("sip:"),
    websocketUrl: z
      .url()
      .refine((value) => ["ws:", "wss:"].includes(new URL(value).protocol)),
    authorizationUsername: ExtensionSchema,
    authorizationPassword: z.string().min(32),
    displayName: z.string().min(1),
  })
  .strict();

export class StartCrewCallRequestDto extends createZodDto(
  StartCrewCallRequestSchema,
) {}
export class CrewCallCommandDto extends createZodDto(CrewCallCommandSchema) {}
export class BrowserPhoneConfigDto extends createZodDto(
  BrowserPhoneConfigSchema,
) {}
export type CrewCallCommand = z.infer<typeof CrewCallCommandSchema>;
export type BrowserPhoneConfig = z.infer<typeof BrowserPhoneConfigSchema>;
