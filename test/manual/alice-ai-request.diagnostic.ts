import { z } from "zod";

import type { GenerateCallerReplyRequest } from "@/contracts";
import {
  type AliceAiEnvironment,
  parseAliceAiConfig,
} from "@/modules/ai-gateway/adapters/alice-ai/alice-ai.config";
import {
  buildAliceAiRequest,
  type AliceAiChatCompletionRequest,
} from "@/modules/ai-gateway/adapters/alice-ai/alice-ai.request";

const DiagnosticStageNameSchema = z.enum([
  "basic",
  "streaming",
  "provider-options",
  "structured-non-strict",
  "structured-strict",
]);

const DiagnosticStageSchema = z
  .object({
    name: DiagnosticStageNameSchema,
    body: z.record(z.string(), z.unknown()),
  })
  .strict();

type DiagnosticStage = z.infer<typeof DiagnosticStageSchema>;

const ALICE_ENVIRONMENT_KEYS = [
  "YANDEX_AI_API_KEY",
  "YANDEX_AI_FOLDER_ID",
  "YANDEX_AI_BASE_URL",
  "YANDEX_AI_MODEL",
  "YANDEX_AI_REQUEST_TIMEOUT_MS",
] as const satisfies readonly (keyof AliceAiEnvironment)[];

const selectEnvironment = (): Record<string, unknown> =>
  Object.fromEntries(
    ALICE_ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]),
  );

const createRequest = (): GenerateCallerReplyRequest => ({
  requestId: "diagnostic-request",
  sessionId: "diagnostic-session",
  scenarioVersionId: "diagnostic-scenario",
  operatorText: "Что произошло?",
  context: {
    persona: {
      id: "diagnostic-caller",
      description: "Тревожный заявитель, который отвечает кратко.",
      language: "Russian",
    },
    allowedFacts: [{ id: "incident", value: "На кухне пожар." }],
    recentTurns: [],
  },
});

const createStages = (
  request: AliceAiChatCompletionRequest,
): readonly DiagnosticStage[] => {
  const basicBody = {
    model: request.model,
    messages: request.messages,
    max_tokens: request.max_tokens,
    temperature: request.temperature,
  };
  const providerOptionsBody = {
    ...basicBody,
    stream: true,
    store: request.store,
    n: request.n,
  };
  const nonStrictResponseFormat = {
    ...request.response_format,
    json_schema: {
      ...request.response_format.json_schema,
      strict: false as const,
    },
  };

  return [
    { name: "basic", body: basicBody },
    { name: "streaming", body: { ...basicBody, stream: true } },
    { name: "provider-options", body: providerOptionsBody },
    {
      name: "structured-non-strict",
      body: {
        ...providerOptionsBody,
        response_format: nonStrictResponseFormat,
      },
    },
    {
      name: "structured-strict",
      body: request,
    },
  ].map((stage) => DiagnosticStageSchema.parse(stage));
};

const sanitizeDetails = (raw: string, secrets: readonly string[]): unknown => {
  const redacted = secrets.reduce(
    (value, secret) => value.replaceAll(secret, "[REDACTED]"),
    raw.slice(0, 4_096),
  );

  try {
    return JSON.parse(redacted) as unknown;
  } catch {
    return redacted;
  }
};

const main = async (): Promise<void> => {
  const config = parseAliceAiConfig(selectEnvironment());
  const request = buildAliceAiRequest(createRequest(), config);
  const results: Array<Record<string, unknown>> = [];

  for (const stage of createStages(request)) {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${config.apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Project": config.folderId,
      },
      body: JSON.stringify(stage.body),
      signal: AbortSignal.timeout(30_000),
    });

    if (response.ok) {
      results.push({ stage: stage.name, status: response.status, ok: true });
      await response.body?.cancel();
      continue;
    }

    results.push({
      stage: stage.name,
      status: response.status,
      ok: false,
      details: sanitizeDetails(await response.text(), [
        config.apiKey,
        config.folderId,
      ]),
    });
    break;
  }

  console.log(
    JSON.stringify(
      {
        provider: {
          baseUrl: config.baseUrl,
          model: config.model,
        },
        results,
      },
      null,
      2,
    ),
  );
};

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
