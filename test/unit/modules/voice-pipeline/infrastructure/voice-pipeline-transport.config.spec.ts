import { parseVoicePipelineTransportConfig } from "@/modules/voice-pipeline/infrastructure/voice-pipeline-transport.config";

describe("parseVoicePipelineTransportConfig", () => {
  it("keeps the synthetic scenario disabled by default", () => {
    expect(parseVoicePipelineTransportConfig({})).toEqual({
      demoEnabled: false,
    });
  });

  it("enables the synthetic scenario explicitly", () => {
    expect(
      parseVoicePipelineTransportConfig({
        VOICE_PIPELINE_DEMO_ENABLED: "true",
      }),
    ).toEqual({ demoEnabled: true });
  });

  it("rejects invalid values and unknown fields", () => {
    expect(() =>
      parseVoicePipelineTransportConfig({
        VOICE_PIPELINE_DEMO_ENABLED: "1",
      }),
    ).toThrow();
    expect(() =>
      parseVoicePipelineTransportConfig({ UNKNOWN_OPTION: "true" }),
    ).toThrow();
  });
});
