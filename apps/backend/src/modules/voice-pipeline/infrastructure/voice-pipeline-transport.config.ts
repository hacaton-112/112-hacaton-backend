import { z } from "zod";

export const VoicePipelineTransportConfigSchema = z
  .object({
    demoEnabled: z.boolean().default(false),
  })
  .strict();

export const VoicePipelineTransportEnvironmentSchema = z
  .object({
    VOICE_PIPELINE_DEMO_ENABLED: z.enum(["true", "false"]).optional(),
  })
  .strict();

export type VoicePipelineTransportConfig = z.infer<
  typeof VoicePipelineTransportConfigSchema
>;
export type VoicePipelineTransportEnvironment = z.infer<
  typeof VoicePipelineTransportEnvironmentSchema
>;

export const parseVoicePipelineTransportConfig = (
  input: unknown,
): VoicePipelineTransportConfig => {
  const environment = VoicePipelineTransportEnvironmentSchema.parse(input);

  return VoicePipelineTransportConfigSchema.parse({
    demoEnabled: environment.VOICE_PIPELINE_DEMO_ENABLED === "true",
  });
};
