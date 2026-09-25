import { ConfigService } from "@nestjs/config";
import { assertOfflineEndpoint, guardedOfflineFetch } from "./offline-policy";
import { createAiProviders } from "./adapters/text-ai-adapter.module";

describe("offline AI policy", () => {
  it.each([
    "http://127.0.0.1:8080",
    "http://192.168.1.4",
    "http://10.0.0.1",
    "ws://[::1]",
    "https://llm.internal",
  ])("permits private endpoint %s", (url) => {
    expect(() => assertOfflineEndpoint(url, ["llm.internal"])).not.toThrow();
  });
  it.each([
    "https://example.org",
    "http://8.8.8.8",
    "file:///etc/hosts",
    "https://user:pass@127.0.0.1",
    "http://172.32.0.1",
  ])("rejects endpoint %s", (url) => {
    expect(() => assertOfflineEndpoint(url, ["8.8.8.8"])).toThrow();
  });
  it("refuses an external dialogue endpoint at startup without making a request", () => {
    const fetcher = jest.fn();
    expect(() =>
      createAiProviders(
        new ConfigService({
          VOICE_EXECUTION_PROFILE: "offline-hybrid",
          LLM_BASE_URL: "https://example.org/v1",
          LLM_MODEL: "dialogue-model",
        }),
        fetcher,
      ),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("refuses an external tools endpoint in offline-hybrid mode", () => {
    const fetcher = jest.fn();
    expect(() =>
      createAiProviders(
        new ConfigService({
          VOICE_EXECUTION_PROFILE: "offline-hybrid",
          LLM_PROVIDER: "local",
          LLM_BASE_URL: "http://127.0.0.1:8080/v1",
          LLM_MODEL: "dialogue-model",
          TOOLS_LLM_BASE_URL: "https://example.org/v1",
        }),
        fetcher,
      ),
    ).toThrow("private IP or an explicitly allowed internal hostname");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("disables redirects and refuses external requests before fetch", async () => {
    const fetcher = jest.fn().mockResolvedValue(Response.json({}));
    const guarded = guardedOfflineFetch(
      new ConfigService({ VOICE_EXECUTION_PROFILE: "offline-hybrid" }),
      fetcher,
    );
    await guarded("http://127.0.0.1:8080", { redirect: "follow" });
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:8080", {
      redirect: "error",
    });
    expect(() => guarded("https://example.org")).toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
