import {
  DEFAULT_MLX_AUDIO_BASE_ICL_MODEL,
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
  DEFAULT_VLLM_OMNI_BASE_ICL_MODEL,
  DEFAULT_VLLM_OMNI_TTS_BASE_URL,
  DEFAULT_VLLM_OMNI_TTS_MODEL,
} from "./vllm-omni/vllm-omni-tts.config";

const referenceVoices = {
  defaults: { male: "dylan" },
  voices: {
    dylan: {
      id: "dylan",
      gender: "male" as const,
      source: "synthetic" as const,
      audioPath: "/voices/dylan.wav",
      refText: "Проверка связи. Я говорю спокойно и разборчиво.",
      sha256: "a".repeat(64),
      audioDataUrl: "data:audio/wav;base64,UklGRg==",
    },
  },
};

describe(parseQwenTtsConfig.name, () => {
  it("applies local MLX-Audio defaults", () => {
    expect(parseQwenTtsConfig({})).toEqual({
      provider: "mlx-audio",
      mode: "custom-voice",
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
      mode: "custom-voice",
      baseUrl: DEFAULT_VLLM_OMNI_TTS_BASE_URL,
      model: DEFAULT_VLLM_OMNI_TTS_MODEL,
      requestTimeoutMs: DEFAULT_QWEN_TTS_REQUEST_TIMEOUT_MS,
    });
  });

  it("applies Piper CPU defaults", () => {
    expect(parseQwenTtsConfig({ QWEN_TTS_PROVIDER: "piper" })).toEqual({
      provider: "piper",
      mode: "custom-voice",
      model: "piper",
      baseUrl: "http://127.0.0.1:5000",
      maleVoice: "ru_RU-dmitri-medium",
      femaleVoice: "ru_RU-irina-medium",
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
      mode: "custom-voice",
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
      mode: "custom-voice",
      baseUrl: "http://localhost:8091",
      model: "local/Qwen3-TTS",
      requestTimeoutMs: 90_000,
    });
  });

  it.each([
    ["mlx-audio", DEFAULT_MLX_AUDIO_BASE_ICL_MODEL],
    ["vllm-omni", DEFAULT_VLLM_OMNI_BASE_ICL_MODEL],
  ] as const)("loads Base ICL references for %s", (provider, model) => {
    const loadReferences = jest.fn().mockReturnValue(referenceVoices);

    const result = parseQwenTtsConfig(
      {
        QWEN_TTS_PROVIDER: provider,
        QWEN_TTS_MODE: "base-icl",
        QWEN_TTS_REFERENCE_VOICES_PATH: "config/reference-voices.json",
      },
      loadReferences,
    );

    expect(result).toEqual(
      expect.objectContaining({
        provider,
        mode: "base-icl",
        model,
        referenceVoices,
      }),
    );
    expect(loadReferences).toHaveBeenCalledWith("config/reference-voices.json");
  });

  it("requires a registry and a Base model in ICL mode", () => {
    expect(() => parseQwenTtsConfig({ QWEN_TTS_MODE: "base-icl" })).toThrow(
      "QWEN_TTS_REFERENCE_VOICES_PATH",
    );

    expect(() =>
      parseQwenTtsConfig(
        {
          QWEN_TTS_MODE: "base-icl",
          QWEN_TTS_MODEL: "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
          QWEN_TTS_REFERENCE_VOICES_PATH: "voices.json",
        },
        () => referenceVoices,
      ),
    ).toThrow("requires a Qwen3-TTS Base model");
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
    ["invalid mode", { QWEN_TTS_MODE: "voice-design" }],
    ["unknown setting", { UNKNOWN_SETTING: "value" }],
  ])("rejects %s", (_name, input) => {
    expect(() => parseQwenTtsConfig(input)).toThrow();
  });
});
