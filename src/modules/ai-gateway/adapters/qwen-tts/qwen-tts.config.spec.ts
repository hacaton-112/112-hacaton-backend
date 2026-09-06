import {
  DEFAULT_QWEN_TTS_BASE_URL,
  DEFAULT_QWEN_TTS_MODEL,
  DEFAULT_QWEN_TTS_REQUEST_TIMEOUT_MS,
  DEFAULT_QWEN_TTS_STREAMING_INTERVAL_SECONDS,
  MAX_QWEN_TTS_REQUEST_TIMEOUT_MS,
  MAX_QWEN_TTS_STREAMING_INTERVAL_SECONDS,
  MIN_QWEN_TTS_REQUEST_TIMEOUT_MS,
  MIN_QWEN_TTS_STREAMING_INTERVAL_SECONDS,
  parseQwenTtsConfig,
} from "./qwen-tts.config";

describe(parseQwenTtsConfig.name, () => {
  it("applies local MLX-Audio defaults", () => {
    expect(parseQwenTtsConfig({})).toEqual({
      baseUrl: DEFAULT_QWEN_TTS_BASE_URL,
      model: DEFAULT_QWEN_TTS_MODEL,
      streamingIntervalSeconds: DEFAULT_QWEN_TTS_STREAMING_INTERVAL_SECONDS,
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
      baseUrl: "http://localhost:8080",
      model: "local/qwen-tts",
      streamingIntervalSeconds: 0.5,
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
    ["unknown setting", { UNKNOWN_SETTING: "value" }],
  ])("rejects %s", (_name, input) => {
    expect(() => parseQwenTtsConfig(input)).toThrow();
  });
});
