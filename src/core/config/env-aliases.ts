/**
 * Имена переменных окружения, оставшиеся от прежнего выбора моделей.
 *
 * `QWEN_TTS_*` называл провайдером Qwen там, где давно работает Piper, а
 * `LOCAL_LLM_*` дублировал уже существующий `LLM_PROVIDER`. Старое имя
 * продолжает работать: развёрнутые окружения и чужие `.env` не должны падать
 * из-за переименования.
 */
export const DEPRECATED_ENVIRONMENT_ALIASES: Readonly<Record<string, string>> =
  {
    QWEN_TTS_PROVIDER: "TTS_PROVIDER",
    QWEN_TTS_MODE: "TTS_MODE",
    QWEN_TTS_BASE_URL: "TTS_BASE_URL",
    QWEN_TTS_MODEL: "TTS_MODEL",
    QWEN_TTS_REFERENCE_VOICES_PATH: "TTS_REFERENCE_VOICES_PATH",
    QWEN_TTS_STREAMING_INTERVAL_SECONDS: "TTS_STREAMING_INTERVAL_SECONDS",
    QWEN_TTS_REQUEST_TIMEOUT_MS: "TTS_REQUEST_TIMEOUT_MS",
    LOCAL_LLM_BASE_URL: "LLM_BASE_URL",
    LOCAL_LLM_MODEL: "LLM_MODEL",
    LOCAL_LLM_API_KEY: "LLM_API_KEY",
    LOCAL_LLM_TIMEOUT_MS: "LLM_TIMEOUT_MS",
    LOCAL_LLM_INTENT_TIMEOUT_MS: "LLM_INTENT_TIMEOUT_MS",
    LOCAL_LLM_REPLY_MAX_TOKENS: "LLM_REPLY_MAX_TOKENS",
    LOCAL_LLM_REPLY_TEMPERATURE: "LLM_REPLY_TEMPERATURE",
    LOCAL_LLM_REPLY_THINKING: "LLM_REPLY_THINKING",
    LOCAL_LLM_CONCURRENCY: "LLM_CONCURRENCY",
    LOCAL_LLM_QUEUE_SIZE: "LLM_QUEUE_SIZE",
    LOCAL_LLM_QUEUE_WAIT_MS: "LLM_QUEUE_WAIT_MS",
  };

/**
 * Переносит значения устаревших имён на действующие и возвращает найденные.
 *
 * Явно заданное новое имя всегда важнее: окружение, где заданы оба, читается
 * как задумано, а не как получилось по порядку ключей.
 */
export const applyDeprecatedEnvironmentAliases = (
  environment: Record<string, string | undefined>,
): readonly string[] => {
  const used: string[] = [];

  for (const [deprecated, current] of Object.entries(
    DEPRECATED_ENVIRONMENT_ALIASES,
  )) {
    const value = environment[deprecated];

    if (value === undefined) {
      continue;
    }

    used.push(deprecated);

    if (environment[current] === undefined) {
      environment[current] = value;
    }
  }

  return used;
};

export const deprecatedEnvironmentWarning = (
  deprecated: readonly string[],
): string =>
  `Deprecated environment variables are still set: ${deprecated.join(", ")}. ` +
  "Rename them (QWEN_TTS_* to TTS_*, LOCAL_LLM_* to LLM_*); support will be removed.";
