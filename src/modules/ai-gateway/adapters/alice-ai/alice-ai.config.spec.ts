import {
  DEFAULT_ALICE_AI_BASE_URL,
  DEFAULT_ALICE_AI_MODEL,
  DEFAULT_ALICE_AI_REQUEST_TIMEOUT_MS,
  parseAliceAiConfig,
} from "./alice-ai.config";

describe(parseAliceAiConfig.name, () => {
  it("parses required credentials and applies defaults", () => {
    expect(
      parseAliceAiConfig({
        YANDEX_AI_API_KEY: "test-api-key",
        YANDEX_AI_FOLDER_ID: "folder-1",
      }),
    ).toEqual({
      apiKey: "test-api-key",
      folderId: "folder-1",
      baseUrl: DEFAULT_ALICE_AI_BASE_URL,
      model: DEFAULT_ALICE_AI_MODEL,
      requestTimeoutMs: DEFAULT_ALICE_AI_REQUEST_TIMEOUT_MS,
    });
  });

  it("normalizes custom values", () => {
    expect(
      parseAliceAiConfig({
        YANDEX_AI_API_KEY: "test-api-key",
        YANDEX_AI_FOLDER_ID: "folder-1",
        YANDEX_AI_BASE_URL: "http://localhost:8080/v1/",
        YANDEX_AI_MODEL: "custom-model",
        YANDEX_AI_REQUEST_TIMEOUT_MS: "1500",
      }),
    ).toEqual({
      apiKey: "test-api-key",
      folderId: "folder-1",
      baseUrl: "http://localhost:8080/v1",
      model: "custom-model",
      requestTimeoutMs: 1_500,
    });
  });

  it.each([
    ["missing API key", { YANDEX_AI_FOLDER_ID: "folder-1" }],
    ["missing folder ID", { YANDEX_AI_API_KEY: "test-api-key" }],
    [
      "invalid base URL",
      {
        YANDEX_AI_API_KEY: "test-api-key",
        YANDEX_AI_FOLDER_ID: "folder-1",
        YANDEX_AI_BASE_URL: "not-a-url",
      },
    ],
    [
      "short timeout",
      {
        YANDEX_AI_API_KEY: "test-api-key",
        YANDEX_AI_FOLDER_ID: "folder-1",
        YANDEX_AI_REQUEST_TIMEOUT_MS: "499",
      },
    ],
    [
      "long timeout",
      {
        YANDEX_AI_API_KEY: "test-api-key",
        YANDEX_AI_FOLDER_ID: "folder-1",
        YANDEX_AI_REQUEST_TIMEOUT_MS: "30001",
      },
    ],
    [
      "unknown setting",
      {
        YANDEX_AI_API_KEY: "test-api-key",
        YANDEX_AI_FOLDER_ID: "folder-1",
        UNKNOWN_SETTING: "value",
      },
    ],
  ])("rejects %s", (_name, input) => {
    expect(() => parseAliceAiConfig(input)).toThrow();
  });
});
