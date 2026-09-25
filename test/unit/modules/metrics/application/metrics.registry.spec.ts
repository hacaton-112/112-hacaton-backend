import { METRIC_PREFIX, MetricsRegistry } from "@/modules/metrics/application/metrics.registry";

describe(MetricsRegistry.name, () => {
  it("exposes the process metrics under the project prefix", async () => {
    const text = await new MetricsRegistry().render();

    expect(text).toContain(`${METRIC_PREFIX}process_resident_memory_bytes`);
    expect(text).toContain(`${METRIC_PREFIX}nodejs_eventloop_lag_p99_seconds`);
  });

  it("renders a metric registered through it", async () => {
    const metrics = new MetricsRegistry();
    const counter = metrics.counter({
      name: `${METRIC_PREFIX}test_events_total`,
      help: "Test events",
      labelNames: ["kind"],
    });

    counter.labels("demo").inc(2);

    expect(await metrics.render()).toContain(
      `${METRIC_PREFIX}test_events_total{kind="demo"} 2`,
    );
  });

  it("lets two registries hold a metric with the same name", () => {
    // Приложение в тестах создаётся не раз: общий глобальный реестр отказал
    // бы регистрировать одноимённую метрику повторно.
    const register = () =>
      new MetricsRegistry().gauge({
        name: `${METRIC_PREFIX}duplicate`,
        help: "Duplicate",
      });

    expect(() => {
      register();
      register();
    }).not.toThrow();
  });
});
