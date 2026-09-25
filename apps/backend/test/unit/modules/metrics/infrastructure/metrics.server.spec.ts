import { MetricsRegistry } from "@/modules/metrics/application/metrics.registry";
import { MetricsServer } from "@/modules/metrics/infrastructure/metrics.server";

const startServer = async (enabled = true) => {
  const server = new MetricsServer(new MetricsRegistry(), {
    enabled,
    host: "127.0.0.1",
    port: 0,
  });

  await server.onApplicationBootstrap();

  return server;
};

describe(MetricsServer.name, () => {
  it("serves the metrics on its own port", async () => {
    const server = await startServer();

    try {
      const response = await fetch(
        `http://127.0.0.1:${server.address()!.port}/metrics`,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/plain");
      expect(await response.text()).toContain(
        "system112_process_resident_memory_bytes",
      );
    } finally {
      await server.onApplicationShutdown();
    }
  });

  it("answers nothing else on that port", async () => {
    const server = await startServer();

    try {
      const response = await fetch(
        `http://127.0.0.1:${server.address()!.port}/api/v1/health`,
      );

      expect(response.status).toBe(404);
    } finally {
      await server.onApplicationShutdown();
    }
  });

  it("does not listen when metrics are turned off", async () => {
    const server = await startServer(false);

    expect(server.address()).toBeNull();
    await server.onApplicationShutdown();
  });
});
