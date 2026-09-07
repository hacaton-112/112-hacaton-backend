import {
  DEFAULT_MLX_AUDIO_TTS_BASE_URL,
  DEFAULT_MLX_AUDIO_TTS_MODEL,
  DEFAULT_MLX_AUDIO_TTS_STREAMING_INTERVAL_SECONDS,
  DEFAULT_QWEN_TTS_REQUEST_TIMEOUT_MS,
  MAX_QWEN_TTS_REQUEST_TIMEOUT_MS,
  MAX_QWEN_TTS_STREAMING_INTERVAL_SECONDS,
  MIN_QWEN_TTS_REQUEST_TIMEOUT_MS,
  MIN_QWEN_TTS_STREAMING_INTERVAL_SECONDS,
  parseQwenTtsConfig,
} from "./qwen-tts.config";
import {
  DEFAULT_VLLM_OMNI_TTS_BASE_URL,
  DEFAULT_VLLM_OMNI_TTS_MODEL,
} from "./vllm-omni/vllm-omni-tts.config";

describe(parseQwenTtsConfig.name, () => {
  it("applies local MLX-Audio defaults", () => {
    expect(parseQwenTtsConfig({})).toEqual({
      provider: "mlx-audio",
      baseUrl: DEFAULT_MLX_AUDIO_TTS_BASE_URL,
      model: DEFAULT_MLX_AUDIO_TTS_MODEL,
      streamingIntervalSeconds:
        DEFAULT_MLX_AUDIO_TTS_STREAMING_INTERVAL_SECONDS,
      requestTimeoutMs: DEFAULT_QWEN_TTS_REQUEST_TIMEOUT_MS,
    });
  });

  it("applies vLLM Omni defaults", () => {
    expect(parseQwenTtsConfig({ QWEN_TTS_PROVIDER: "vllm-omni" })).toEqual({
      provider: "vllm-omni",
      baseUrl: DEFAULT_VLLM_OMNI_TTS_BASE_URL,
      model: DEFAULT_VLLM_OMNI_TTS_MODEL,
      requestTimeoutMs: DEFAULT_QWEN_TTS_REQUEST_TIMEOUT_MS,
    });
  });

  it("normalizes custom values", () => {
    expect(
      parseQwenTtsConfig({
        QWEN_TTS_BASE_URL: "http://localhost:8080/",
        QWEN_TTS_MODEL: "local/qwen-tts",
        QWEN_TTS_STREAMING_INTERVAL_SECONDS: "0.5",
        QWEN_TTS_REQUEST_TIMEOUT_MS: "90000",
      }),
    ).toEqual({
      provider: "mlx-audio",
      baseUrl: "http://localhost:8080",
      model: "local/qwen-tts",
      streamingIntervalSeconds: 0.5,
      requestTimeoutMs: 90_000,
    });
  });

  it("ignores the MLX streaming interval for vLLM Omni", () => {
    expect(
      parseQwenTtsConfig({
        QWEN_TTS_PROVIDER: "vllm-omni",
        QWEN_TTS_STREAMING_INTERVAL_SECONDS: "0.5",
      }),
    ).not.toHaveProperty("streamingIntervalSeconds");
  });

  it("normalizes custom vLLM Omni values", () => {
    expect(
      parseQwenTtsConfig({
        QWEN_TTS_PROVIDER: "vllm-omni",
        QWEN_TTS_BASE_URL: "http://localhost:8091/",
        QWEN_TTS_MODEL: "local/Qwen3-TTS",
        QWEN_TTS_REQUEST_TIMEOUT_MS: "90000",
      }),
    ).toEqual({
      provider: "vllm-omni",
      baseUrl: "http://localhost:8091",
      model: "local/Qwen3-TTS",
      requestTimeoutMs: 90_000,
    });
  });

  it.each([
    [
      "minimum boundaries",
      {
        QWEN_TTS_STREAMING_INTERVAL_SECONDS:
          MIN_QWEN_TTS_STREAMING_INTERVAL_SECONDS,
        QWEN_TTS_REQUEST_TIMEOUT_MS: MIN_QWEN_TTS_REQUEST_TIMEOUT_MS,
      },
    ],
    [
      "maximum boundaries",
      {
        QWEN_TTS_STREAMING_INTERVAL_SECONDS:
          MAX_QWEN_TTS_STREAMING_INTERVAL_SECONDS,
        QWEN_TTS_REQUEST_TIMEOUT_MS: MAX_QWEN_TTS_REQUEST_TIMEOUT_MS,
      },
    ],
  ])("accepts %s", (_name, input) => {
    expect(() => parseQwenTtsConfig(input)).not.toThrow();
  });

  it.each([
    ["invalid URL", { QWEN_TTS_BASE_URL: "not-a-url" }],
    ["unsupported URL scheme", { QWEN_TTS_BASE_URL: "ftp://localhost" }],
    [
      "short interval",
      {
        QWEN_TTS_STREAMING_INTERVAL_SECONDS:
          MIN_QWEN_TTS_STREAMING_INTERVAL_SECONDS - 0.01,
      },
    ],
    [
      "long interval",
      {
        QWEN_TTS_STREAMING_INTERVAL_SECONDS:
          MAX_QWEN_TTS_STREAMING_INTERVAL_SECONDS + 0.01,
      },
    ],
    [
      "short timeout",
      { QWEN_TTS_REQUEST_TIMEOUT_MS: MIN_QWEN_TTS_REQUEST_TIMEOUT_MS - 1 },
    ],
    [
      "long timeout",
      { QWEN_TTS_REQUEST_TIMEOUT_MS: MAX_QWEN_TTS_REQUEST_TIMEOUT_MS + 1 },
    ],
    ["fractional timeout", { QWEN_TTS_REQUEST_TIMEOUT_MS: 1_000.5 }],
    ["invalid model", { QWEN_TTS_MODEL: "bad model" }],
    ["invalid provider", { QWEN_TTS_PROVIDER: "unknown" }],
    ["unknown setting", { UNKNOWN_SETTING: "value" }],
  ])("rejects %s", (_name, input) => {
    expect(() => parseQwenTtsConfig(input)).toThrow();
  });
});
