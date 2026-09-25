import { splitLeased, summarizeQueue } from "@/modules/users/application/admin-queues.service";

describe("admin queue health", () => {
  it("counts queued, running and failed jobs and the oldest open one", () => {
    expect(
      summarizeQueue("scenario_generation", [
        {
          status: "queued",
          total: 2,
          oldestAt: new Date("2026-09-22T10:00:00Z"),
        },
        {
          status: "running",
          total: 1,
          oldestAt: new Date("2026-09-22T11:00:00Z"),
        },
        {
          status: "failed",
          total: 3,
          oldestAt: new Date("2026-09-20T09:00:00Z"),
        },
        {
          status: "done",
          total: 40,
          oldestAt: new Date("2026-09-01T09:00:00Z"),
        },
      ]),
    ).toMatchObject({
      queued: 2,
      processing: 1,
      failed: 3,
      // Закрытые задания возраст очереди не задают.
      oldestAt: "2026-09-22T10:00:00.000Z",
    });
  });

  it("reports an idle queue without an age", () => {
    expect(
      summarizeQueue("dds_insights", [
        {
          status: "done",
          total: 5,
          oldestAt: new Date("2026-09-22T10:00:00Z"),
        },
      ]),
    ).toMatchObject({ queued: 0, processing: 0, failed: 0, oldestAt: null });
  });

  it("moves leased text evaluations from waiting to running", () => {
    const rows = [
      {
        status: "pending",
        total: 4,
        oldestAt: new Date("2026-09-22T10:00:00Z"),
      },
      { status: "done", total: 9, oldestAt: new Date("2026-09-22T08:00:00Z") },
    ];

    expect(
      summarizeQueue("dds_text_evaluation", splitLeased(rows, 3)),
    ).toMatchObject({
      queued: 1,
      processing: 3,
      oldestAt: "2026-09-22T10:00:00.000Z",
    });
    expect(
      summarizeQueue("dds_text_evaluation", splitLeased(rows, 0)),
    ).toMatchObject({ queued: 4, processing: 0 });
  });
});
