import { ConfigService } from "@nestjs/config";
import type { StructuredOutputRequest } from "../alice-ai/alice-ai-structured-output.client";
import { createAiProviders } from "../alice-ai/alice-ai-adapter.module";
import { LocalLlmAdapter, LocalLlmConfigSchema } from "./local-llm.adapter";

const config = LocalLlmConfigSchema.parse({
  baseUrl: "http://127.0.0.1:8080/v1/",
  model: "training-model",
});
const request: StructuredOutputRequest = {
  schemaName: "test",
  schemaDescription: "Test",
  schema: { type: "object" },
  systemPrompt: "Return JSON",
  userPrompt: "Synthetic test",
  maxTokens: 128,
  signal: new AbortController().signal,
};
const response = () =>
  Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });

describe(LocalLlmAdapter.name, () => {
  it("uses a local model name, structured output and non-thinking mode without cloud headers", async () => {
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(response());
    const adapter = new LocalLlmAdapter(config, fetcher);
    await expect(adapter.complete(request)).resolves.toEqual({ ok: true });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:8080/v1/chat/completions");
    const body = JSON.parse(init!.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "training-model",
      chat_template_kwargs: { enable_thinking: false },
      reasoning_effort: "none",
    });
    expect(init!.headers).toEqual({ "Content-Type": "application/json" });
    expect(init!.redirect).toBe("error");
  });
  it("rejects excess work immediately, then releases the slot", async () => {
    let resolve!: (response: Response) => void;
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValue(response());
    const adapter = new LocalLlmAdapter(config, fetcher);
    const first = adapter.complete(request);
    await expect(adapter.complete(request)).rejects.toMatchObject({
      status: 429,
      retryable: false,
    });
    resolve(response());
    await first;
    await expect(adapter.complete(request)).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("releases slots after provider errors and never retries through cloud", async () => {
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(response());
    const adapter = new LocalLlmAdapter(config, fetcher);
    await expect(adapter.complete(request)).rejects.toThrow("offline");
    await expect(adapter.complete(request)).resolves.toEqual({ ok: true });
    expect(
      fetcher.mock.calls.every(
        ([url]) => url === "http://127.0.0.1:8080/v1/chat/completions",
      ),
    ).toBe(true);
  });
  it("supports local startup without Alice credentials and shares the concurrency budget", () => {
    const providers = createAiProviders(
      new ConfigService({
        LLM_PROVIDER: "local",
        LOCAL_LLM_BASE_URL: config.baseUrl,
        LOCAL_LLM_MODEL: config.model,
      }),
      jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(),
    );
    expect(providers.llm).toBeInstanceOf(LocalLlmAdapter);
    expect(providers.llm).toBe(providers.questions);
    expect(providers.llm).toBe(providers.structured);
  });
  it("validates configuration and rejects already cancelled work before fetch", async () => {
    expect(
      LocalLlmConfigSchema.safeParse({ ...config, concurrency: 0 }).success,
    ).toBe(false);
    const fetcher = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >();
    await expect(
      new LocalLlmAdapter(config, fetcher).complete({
        ...request,
        signal: AbortSignal.abort(),
      }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
