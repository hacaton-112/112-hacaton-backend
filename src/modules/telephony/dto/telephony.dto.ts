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
          userId: z.string().min(1),
          fullName: z.string().min(1),
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

export class StartCrewCallRequestDto extends createZodDto(
  StartCrewCallRequestSchema,
) {}
export class CrewCallCommandDto extends createZodDto(CrewCallCommandSchema) {}
export type CrewCallCommand = z.infer<typeof CrewCallCommandSchema>;
