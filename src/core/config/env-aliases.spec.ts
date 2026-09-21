import {
  applyDeprecatedEnvironmentAliases,
  DEPRECATED_ENVIRONMENT_ALIASES,
} from "./env-aliases";

describe("applyDeprecatedEnvironmentAliases", () => {
  it("carries a deprecated value over to its current name", () => {
    const environment: Record<string, string | undefined> = {
      LOCAL_LLM_BASE_URL: "http://local-llm:8080/v1",
      QWEN_TTS_PROVIDER: "piper",
    };

    const used = applyDeprecatedEnvironmentAliases(environment);

    expect(environment.LLM_BASE_URL).toBe("http://local-llm:8080/v1");
    expect(environment.TTS_PROVIDER).toBe("piper");
    expect([...used].sort()).toEqual([
      "LOCAL_LLM_BASE_URL",
      "QWEN_TTS_PROVIDER",
    ]);
  });

  it("keeps an explicitly set current name", () => {
    const environment: Record<string, string | undefined> = {
      LOCAL_LLM_MODEL: "bitnet",
      LLM_MODEL: "training-model",
    };

    applyDeprecatedEnvironmentAliases(environment);

    expect(environment.LLM_MODEL).toBe("training-model");
  });

  it("reports nothing when only current names are used", () => {
    const environment: Record<string, string | undefined> = {
      LLM_MODEL: "training-model",
      TTS_PROVIDER: "piper",
    };

    expect(applyDeprecatedEnvironmentAliases(environment)).toEqual([]);
  });

  it("never maps a deprecated name onto another deprecated name", () => {
    const deprecated = new Set(Object.keys(DEPRECATED_ENVIRONMENT_ALIASES));

    for (const current of Object.values(DEPRECATED_ENVIRONMENT_ALIASES)) {
      expect(deprecated.has(current)).toBe(false);
    }
  });
});
