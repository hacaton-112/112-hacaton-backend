import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const OBSERVABILITY_DIR = join(process.cwd(), "..", "..", "infra", "observability");
const DASHBOARDS_DIR = join(OBSERVABILITY_DIR, "grafana/dashboards");
const RULES_PATH = join(
  OBSERVABILITY_DIR,
  "prometheus/rules/system112.rules.yml",
);

type DashboardTarget = {
  datasource?: { uid?: string };
  expr?: string;
};

type DashboardPanel = {
  datasource?: { uid?: string };
  targets?: DashboardTarget[];
};

type Dashboard = {
  panels?: DashboardPanel[];
  title?: string;
  uid?: string;
};

const dashboardFiles = () =>
  readdirSync(DASHBOARDS_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort();

describe("provisioned observability assets", () => {
  it("ships valid dashboards with stable unique UIDs", () => {
    const dashboards = dashboardFiles().map(
      (name) =>
        JSON.parse(
          readFileSync(join(DASHBOARDS_DIR, name), "utf8"),
        ) as Dashboard,
    );
    const uids = dashboards.map(({ uid }) => uid);

    expect(dashboards).toHaveLength(3);
    expect(new Set(uids).size).toBe(dashboards.length);
    for (const dashboard of dashboards) {
      expect(dashboard.uid).toMatch(/^system112-/);
      expect(dashboard.title).toContain("112");
      expect(dashboard.panels?.length).toBeGreaterThan(0);

      for (const panel of dashboard.panels ?? []) {
        for (const target of panel.targets ?? []) {
          if (target.expr) {
            expect(target.datasource?.uid ?? panel.datasource?.uid).toBe(
              "system112-prometheus",
            );
          }
        }
      }
    }
  });

  it("loads rules and both metrics targets in every Prometheus mode", () => {
    for (const name of ["prometheus.yml", "prometheus.host.yml"]) {
      const config = readFileSync(join(OBSERVABILITY_DIR, name), "utf8");

      expect(config).toContain("/etc/prometheus/rules/*.yml");
      expect(config).toContain("job_name: system112-backend");
      expect(config).toContain("job_name: system112-asr");
      expect(config).toContain("metrics_path: /metrics");
    }
  });

  it("ships the actionable alerts and their runbook links", () => {
    const rules = readFileSync(RULES_PATH, "utf8");
    const alertNames = [
      "System112BackendDown",
      "System112AsrDown",
      "System112BackendHighHttpErrorRate",
      "System112BackendHttpLatencyHigh",
      "System112BackendEventLoopLagHigh",
      "System112VoicePipelineFailures",
      "System112VoiceFallbackRateHigh",
      "System112VoiceSessionCapacity",
      "System112AsrHighErrorRate",
      "System112AsrLatencyHigh",
      "System112AsrInferenceQueueSaturated",
      "System112AsrWebsocketErrors",
    ];

    for (const alertName of alertNames) {
      expect(rules).toContain(`- alert: ${alertName}`);
    }
    expect(rules.match(/runbook_url:/g)).toHaveLength(alertNames.length);
    expect(rules).toContain("severity: critical");
    expect(rules).toContain("severity: warning");
    expect(rules).toContain("system112_asr_transcriptions_total");
  });
});
