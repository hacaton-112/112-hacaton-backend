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
