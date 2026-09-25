import { describe, expect, it } from "bun:test";

import { ScenarioGenerationJobSchema } from "../src/contracts/scenario-authoring";
import { isScenarioGenerationActive } from "../src/hooks/use-scenario-generation";

const job = (overrides: Record<string, unknown> = {}) => ({
  id: "job-1",
  brief: "Пожар в гараже во дворе жилого дома",
  status: "queued",
  queuePosition: 2,
  createdAt: "2026-09-22T12:00:00.000Z",
  startedAt: null,
  finishedAt: null,
  error: null,
  result: null,
  ...overrides,
});

describe("scenario generation jobs", () => {
  it("reads a job that is still waiting in the queue", () => {
    expect(ScenarioGenerationJobSchema.parse(job())).toMatchObject({
      status: "queued",
      queuePosition: 2,
    });
  });

  it("reads a failed job with its reason", () => {
    const failed = ScenarioGenerationJobSchema.parse(
      job({
        status: "failed",
        queuePosition: null,
        finishedAt: "2026-09-22T12:01:00.000Z",
        error: {
          code: "SCENARIO_ASSISTANT_INVALID_DRAFT",
          message: "The assistant could not produce a valid scenario draft",
        },
      }),
    );

    expect(failed.error?.code).toBe("SCENARIO_ASSISTANT_INVALID_DRAFT");
  });

  it("keeps polling only while the draft is being written", () => {
    expect(
      isScenarioGenerationActive(ScenarioGenerationJobSchema.parse(job())),
    ).toBe(true);
    expect(
      isScenarioGenerationActive(
        ScenarioGenerationJobSchema.parse(
          job({
            status: "running",
            queuePosition: null,
            startedAt: "2026-09-22T12:00:05.000Z",
          }),
        ),
      ),
    ).toBe(true);
    expect(
      isScenarioGenerationActive(
        ScenarioGenerationJobSchema.parse(
          job({
            status: "failed",
            queuePosition: null,
            error: { code: "X", message: "нет" },
          }),
        ),
      ),
    ).toBe(false);
  });

  it("rejects an unknown status instead of showing it as done", () => {
    expect(
      ScenarioGenerationJobSchema.safeParse(job({ status: "paused" })).success,
    ).toBe(false);
  });
});
