import { parseMetricsConfig } from "./metrics.config";

describe("parseMetricsConfig", () => {
  it("serves metrics on the conventional exporter port by default", () => {
    expect(parseMetricsConfig({})).toEqual({
      enabled: true,
      host: "0.0.0.0",
      port: 9464,
    });
  });

  it("reads the values the environment passes as strings", () => {
    expect(
      parseMetricsConfig({
        METRICS_ENABLED: "false",
        METRICS_HOST: "127.0.0.1",
        METRICS_PORT: "9500",
      }),
    ).toEqual({ enabled: false, host: "127.0.0.1", port: 9500 });
  });

  it("refuses a port that does not exist", () => {
    expect(() => parseMetricsConfig({ METRICS_PORT: "70000" })).toThrow();
  });
});
