import {
  DEFAULT_NOMINATIM_BASE_URL,
  DEFAULT_NOMINATIM_CACHE_TTL_SECONDS,
  DEFAULT_NOMINATIM_REQUEST_TIMEOUT_MS,
  DEFAULT_NOMINATIM_USER_AGENT,
  parseNominatimConfig,
} from "./nominatim.config";

describe(parseNominatimConfig.name, () => {
  it("applies development-safe defaults", () => {
    expect(parseNominatimConfig({})).toEqual({
      baseUrl: DEFAULT_NOMINATIM_BASE_URL,
      userAgent: DEFAULT_NOMINATIM_USER_AGENT,
      requestTimeoutMs: DEFAULT_NOMINATIM_REQUEST_TIMEOUT_MS,
      cacheTtlSeconds: DEFAULT_NOMINATIM_CACHE_TTL_SECONDS,
    });
  });

  it("normalizes a self-hosted endpoint", () => {
    expect(
      parseNominatimConfig({
        NOMINATIM_BASE_URL: "http://nominatim:8080/",
        NOMINATIM_USER_AGENT: "system-112-test/1.0",
        NOMINATIM_REQUEST_TIMEOUT_MS: "2500",
        NOMINATIM_CACHE_TTL_SECONDS: "3600",
      }),
    ).toEqual({
      baseUrl: "http://nominatim:8080",
      userAgent: "system-112-test/1.0",
      requestTimeoutMs: 2_500,
      cacheTtlSeconds: 3_600,
    });
  });

  it.each([
    { NOMINATIM_BASE_URL: "ftp://example.test" },
    { NOMINATIM_USER_AGENT: "x" },
    { NOMINATIM_REQUEST_TIMEOUT_MS: "499" },
    { NOMINATIM_CACHE_TTL_SECONDS: "59" },
    { UNKNOWN_SETTING: "value" },
  ])("rejects invalid configuration %#", (input) => {
    expect(() => parseNominatimConfig(input)).toThrow();
  });
});
