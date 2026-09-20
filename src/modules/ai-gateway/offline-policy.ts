import { isIP } from "node:net";
import { z } from "zod";

export interface ConfigurationReader {
  get<T = string>(key: string): T | undefined;
}
export const offlineSettings = (config: ConfigurationReader) => ({
  enabled:
    z
      .enum(["standard", "offline-hybrid"])
      .default("standard")
      .parse(config.get("VOICE_EXECUTION_PROFILE")) === "offline-hybrid",
  budgetMs: z.coerce
    .number()
    .int()
    .min(500)
    .max(30_000)
    .default(8_000)
    .parse(config.get("VOICE_EXCEPTION_BUDGET_MS")),
  hosts: (
    config.get<string>("OFFLINE_AI_HOSTS") ??
    "localhost,llm,local-llm,asr,qwen-tts,piper-tts,minio"
  )
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
});

/** DNS aliases are deployment-owned; egress firewall remains mandatory on the isolated network. */
export const assertOfflineEndpoint = (
  value: string,
  hosts: readonly string[],
): void => {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const ipv4 = host.split(".").map(Number);
  const privateIp =
    isIP(host) === 4
      ? ipv4[0] === 127 ||
        ipv4[0] === 10 ||
        (ipv4[0] === 192 && ipv4[1] === 168) ||
        (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31)
      : isIP(host) === 6 && (host === "::1" || /^f[cd]/.test(host));
  if (
    !["http:", "https:", "ws:", "wss:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (!privateIp && (isIP(host) !== 0 || !hosts.includes(host)))
  )
    throw new Error(
      "Offline AI endpoint must use a private IP or an explicitly allowed internal hostname",
    );
};

export const guardedOfflineFetch = (
  config: ConfigurationReader,
  implementation: typeof fetch,
): typeof fetch => {
  const policy = offlineSettings(config);
  if (!policy.enabled) return implementation;
  return ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    assertOfflineEndpoint(
      input instanceof Request ? input.url : String(input),
      policy.hosts,
    );
    return implementation(input, { ...init, redirect: "error" });
  }) as typeof fetch;
};
