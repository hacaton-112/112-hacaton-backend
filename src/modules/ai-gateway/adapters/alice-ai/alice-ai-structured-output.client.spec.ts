import type { AliceAiConfig } from "./alice-ai.config";
import { AliceAiStructuredOutputClient } from "./alice-ai-structured-output.client";

const config: AliceAiConfig = {
  apiKey: "test-api-key",
  folderId: "folder-1",
  baseUrl: "https://ai.api.cloud.yandex.net/v1",
  model: "aliceai-llm-flash",
  requestTimeoutMs: 5_000,
};

const request = {
  schemaName: "training_scenario",
  schemaDescription: "Synthetic scenario draft",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: { title: { type: "string" } },
    required: ["title"],
  },
  systemPrompt: "Return synthetic training data.",
  userPrompt: '{"brief":"Учебное происшествие"}',
  maxTokens: 1_024,
  signal: new AbortController().signal,
};

const createFetchMock = (): jest.MockedFunction<typeof fetch> =>
  jest.fn() as jest.MockedFunction<typeof fetch>;

describe(AliceAiStructuredOutputClient.name, () => {
  it("sends a non-streaming strict schema request and parses JSON content", async () => {
    const fetchImplementation = createFetchMock().mockResolvedValue(
      Response.json({
        choices: [{ message: { content: '{"title":"Учебный пожар"}' } }],
      }),
    );
    const client = new AliceAiStructuredOutputClient(
      config,
      fetchImplementation,
    );

    await expect(client.complete(request)).resolves.toEqual({
      title: "Учебный пожар",
    });

    const init = fetchImplementation.mock.calls[0][1];
    expect(init).toEqual(
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({
      stream: false,
      store: false,
      max_tokens: 1_024,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "training_scenario",
          strict: true,
          schema: request.schema,
        },
      },
    });
  });

  it("rejects malformed provider content with a sanitized error", async () => {
    const client = new AliceAiStructuredOutputClient(
      config,
      createFetchMock().mockResolvedValue(
        Response.json({ choices: [{ message: { content: "not-json" } }] }),
      ),
    );

    await expect(client.complete(request)).rejects.toMatchObject({
      code: "invalid-response",
    });
  });

  it("classifies a provider outage as retryable", async () => {
    const client = new AliceAiStructuredOutputClient(
      config,
      createFetchMock().mockResolvedValue(new Response(null, { status: 503 })),
    );

    await expect(client.complete(request)).rejects.toMatchObject({
      code: "http-error",
      status: 503,
      retryable: true,
    });
  });
});
