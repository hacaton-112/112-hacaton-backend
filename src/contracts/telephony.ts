import { z } from "zod";

/** Рабочее место ДДС в учебной IP-АТС и человек за его телефоном. */
export const TelephonyWorkstationSchema = z.object({
  extension: z.string(),
  userId: z.string(),
  fullName: z.string(),
});

export const TelephonyWorkstationListSchema = z.object({
  workstations: z.array(TelephonyWorkstationSchema),
});

export type TelephonyWorkstation = z.infer<typeof TelephonyWorkstationSchema>;

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
