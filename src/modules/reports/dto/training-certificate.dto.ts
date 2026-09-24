import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const TrainingCertificateQuerySchema = z
  .object({ studentId: z.uuid().optional() })
  .strict();

export class TrainingCertificateQueryDto extends createZodDto(
  TrainingCertificateQuerySchema,
) {}
