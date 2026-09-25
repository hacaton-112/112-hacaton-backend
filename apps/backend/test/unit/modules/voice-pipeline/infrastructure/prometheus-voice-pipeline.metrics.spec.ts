import { METRIC_PREFIX, MetricsRegistry } from "@/modules/metrics";

import { PrometheusVoicePipelineMetrics } from "@/modules/voice-pipeline/infrastructure/prometheus-voice-pipeline.metrics";

describe(PrometheusVoicePipelineMetrics.name, () => {
  it("shows zero failures and replies before the first call", async () => {
    const registry = new MetricsRegistry();
    new PrometheusVoicePipelineMetrics(registry);

    // Иначе на пустом дашборде «нет данных» не отличить от «нет ошибок».
    const text = await registry.render();

    expect(text).toContain(
      `${METRIC_PREFIX}voice_turn_failures_total{kind="generated"} 0`,
    );
    expect(text).toContain(
      `${METRIC_PREFIX}caller_replies_total{source="fallback"} 0`,
    );
  });

  it("counts sessions, reply sources, first audio and failures", async () => {
    const registry = new MetricsRegistry();
    const metrics = new PrometheusVoicePipelineMetrics(registry);

    metrics.sessionOpened();
    metrics.sessionOpened();
    metrics.sessionClosed();
    metrics.callerReplyGenerated("model");
    metrics.turnCompleted("generated", 1_200);
    metrics.turnFailed("prescribed");

    const text = await registry.render();

    expect(text).toContain(`${METRIC_PREFIX}voice_sessions 1`);
    expect(text).toContain(
      `${METRIC_PREFIX}caller_replies_total{source="model"} 1`,
    );
    expect(text).toContain(
      `${METRIC_PREFIX}voice_turn_first_audio_seconds_bucket{le="1.25",kind="generated"} 1`,
    );
    expect(text).toContain(
      `${METRIC_PREFIX}voice_turn_first_audio_seconds_bucket{le="1",kind="generated"} 0`,
    );
    expect(text).toContain(
      `${METRIC_PREFIX}voice_turn_failures_total{kind="prescribed"} 1`,
    );
  });
});
