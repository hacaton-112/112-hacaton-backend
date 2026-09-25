import { z } from "zod";
import { DispatchServiceSchema } from "./incident";

/** Рабочее место ДДС в учебной IP-АТС и человек за его телефоном. */
export const TelephonyWorkstationSchema = z.object({
  extension: z.string(),
  name: z.string(),
  service: DispatchServiceSchema,
  userId: z.string().nullable(),
  fullName: z.string().nullable(),
  email: z.email().nullable(),
  isActive: z.boolean(),
});

export const TelephonyWorkstationListSchema = z.object({
  workstations: z.array(TelephonyWorkstationSchema),
});

export type TelephonyWorkstation = z.infer<typeof TelephonyWorkstationSchema>;

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

export type WorkstationImportReport = z.infer<
  typeof WorkstationImportReportSchema
>;

export const CrewCallCommandSchema = z
  .object({
    eventId: z.uuid(),
    exerciseId: z.uuid(),
    dialedNumber: z.string().regex(/^\d{2,6}$/u),
    workstationExtension: z.string().regex(/^\d{2,6}$/u),
    state: z.literal("ringing"),
  })
  .strict();

export type CrewCallCommand = z.infer<typeof CrewCallCommandSchema>;

export const BrowserPhoneConfigSchema = z
  .object({
    extension: z.string().regex(/^\d{2,6}$/u),
    aor: z.string().startsWith("sip:"),
    websocketUrl: z
      .url()
      .refine((value) => ["ws:", "wss:"].includes(new URL(value).protocol)),
    authorizationUsername: z.string().regex(/^\d{2,6}$/u),
    authorizationPassword: z.string().min(32),
    displayName: z.string().min(1),
  })
  .strict();

export type BrowserPhoneConfig = z.infer<typeof BrowserPhoneConfigSchema>;
