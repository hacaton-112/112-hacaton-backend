import {
  DEFAULT_VLLM_OMNI_TTS_BASE_URL,
  DEFAULT_VLLM_OMNI_TTS_MODEL,
  DEFAULT_VLLM_OMNI_TTS_REQUEST_TIMEOUT_MS,
  VllmOmniTtsConfigSchema,
} from "./vllm-omni-tts.config";

describe("VllmOmniTtsConfigSchema", () => {
  it("applies vLLM Omni defaults", () => {
    expect(
      VllmOmniTtsConfigSchema.parse({
        provider: "vllm-omni",
        mode: "custom-voice",
      }),
    ).toEqual({
      provider: "vllm-omni",
      mode: "custom-voice",
      baseUrl: DEFAULT_VLLM_OMNI_TTS_BASE_URL,
      model: DEFAULT_VLLM_OMNI_TTS_MODEL,
      requestTimeoutMs: DEFAULT_VLLM_OMNI_TTS_REQUEST_TIMEOUT_MS,
    });
  });

  it("normalizes a custom endpoint", () => {
    expect(
      VllmOmniTtsConfigSchema.parse({
        provider: "vllm-omni",
        mode: "custom-voice",
        baseUrl: "http://localhost:9000/",
        model: "local/Qwen3-TTS",
        requestTimeoutMs: 90_000,
      }),
    ).toEqual({
      provider: "vllm-omni",
      mode: "custom-voice",
      baseUrl: "http://localhost:9000",
      model: "local/Qwen3-TTS",
      requestTimeoutMs: 90_000,
    });
  });

  it.each([
    ["invalid URL", { baseUrl: "not-a-url" }],
    ["unsupported URL", { baseUrl: "ftp://localhost" }],
    ["invalid model", { model: "bad model" }],
    ["short timeout", { requestTimeoutMs: 999 }],
    ["long timeout", { requestTimeoutMs: 300_001 }],
    ["unknown setting", { streamingIntervalSeconds: 0.32 }],
  ])("rejects %s", (_name, input) => {
    expect(() =>
      VllmOmniTtsConfigSchema.parse({
        provider: "vllm-omni",
        mode: "custom-voice",
        ...input,
      }),
    ).toThrow();
  });
});
