import { z } from "zod";

export const CallRecordingConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    endpoint: z.string().url(),
    region: z.string().min(1),
    bucket: z.string().min(3),
    accessKeyId: z.string().min(1).optional(),
    secretAccessKey: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (config) =>
      !config.enabled ||
      (config.accessKeyId !== undefined &&
        config.secretAccessKey !== undefined),
    {
      // Лучше не подняться на старте, чем потерять записи молча: пропажу
      // заметят на разборе занятия, когда переигрывать уже нечего.
      message:
        "CALL_RECORDING_S3_ACCESS_KEY_ID and CALL_RECORDING_S3_SECRET_ACCESS_KEY are required when call recording is enabled",
    },
  );

export const CallRecordingEnvironmentSchema = z
  .object({
    CALL_RECORDING_ENABLED: z.enum(["true", "false"]).optional(),
    CALL_RECORDING_S3_ENDPOINT: z.string().optional(),
    CALL_RECORDING_S3_REGION: z.string().optional(),
    CALL_RECORDING_S3_BUCKET: z.string().optional(),
    CALL_RECORDING_S3_ACCESS_KEY_ID: z.string().optional(),
    CALL_RECORDING_S3_SECRET_ACCESS_KEY: z.string().optional(),
  })
  .strict();

export type CallRecordingConfig = z.infer<typeof CallRecordingConfigSchema>;
export type CallRecordingEnvironment = z.infer<
  typeof CallRecordingEnvironmentSchema
>;

export const parseCallRecordingConfig = (
  input: unknown,
): CallRecordingConfig => {
  const environment = CallRecordingEnvironmentSchema.parse(input);

  return CallRecordingConfigSchema.parse({
    enabled: environment.CALL_RECORDING_ENABLED === "true",
    endpoint: environment.CALL_RECORDING_S3_ENDPOINT ?? "http://127.0.0.1:9000",
    region: environment.CALL_RECORDING_S3_REGION ?? "us-east-1",
    bucket: environment.CALL_RECORDING_S3_BUCKET ?? "call-recordings",
    accessKeyId: environment.CALL_RECORDING_S3_ACCESS_KEY_ID,
    secretAccessKey: environment.CALL_RECORDING_S3_SECRET_ACCESS_KEY,
  });
};
