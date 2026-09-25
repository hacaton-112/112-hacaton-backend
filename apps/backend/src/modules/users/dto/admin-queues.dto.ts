import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const AdminQueuesSchema = z.object({
  queues: z.array(
    z.object({
      name: z.enum([
        "scenario_generation",
        "dds_reference_generation",
        "dds_text_evaluation",
        "dds_insights",
      ]),
      queued: z.number().int().nonnegative(),
      processing: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      oldestAt: z.iso.datetime().nullable(),
      enabled: z.boolean(),
    }),
  ),
});

export class AdminQueuesDto extends createZodDto(AdminQueuesSchema) {}
