import { RuntimeHealthService } from "@/modules/health/application/runtime-health.service";

describe(RuntimeHealthService.name, () => {
  it("reports zeros before anything has been measured", () => {
    const service = new RuntimeHealthService();

    const snapshot = service.snapshot();

    expect(snapshot.eventLoopDelayMs).toEqual({
      mean: 0,
      p50: 0,
      p90: 0,
      p99: 0,
      max: 0,
    });
    expect(snapshot.memory.rssMb).toBeGreaterThan(0);
  });

  it("measures the delay while it is running", async () => {
    const service = new RuntimeHealthService();
    service.onModuleInit();

    // Занятый цикл: именно из-за него кадры PCM ждут отправки.
    const until = Date.now() + 60;
    while (Date.now() < until) {
      /* busy */
    }
    await new Promise((resolve) => setTimeout(resolve, 40));

    const snapshot = service.snapshot();
    service.onModuleDestroy();

    expect(snapshot.eventLoopDelayMs.max).toBeGreaterThan(0);
    expect(snapshot.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("starts a fresh window on every read", () => {
    const service = new RuntimeHealthService();
    service.onModuleInit();

    service.snapshot();
    const second = service.snapshot();
    service.onModuleDestroy();

    expect(second.eventLoopDelayMs.mean).toBe(0);
  });
});
