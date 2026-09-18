import { describe, expect, test } from "bun:test";
import {
  preparationLabel,
  ScenarioAudioStatusSchema,
} from "../src/contracts/scenario-audio";
import { CallServerEventSchema } from "../src/contracts/call";

const status = {
  scenarioVersionId: "00000000-0000-4000-8000-000000000001",
  status: "queued" as const,
  completed: 0,
  total: 10,
  workerEnabled: true,
};

describe("scenario audio preparation", () => {
  test("reports disabled worker and retryable failures without claiming readiness", () => {
    expect(preparationLabel({ ...status, workerEnabled: false })).toContain(
      "выключена",
    );
    expect(preparationLabel({ ...status, status: "failed" })).toContain(
      "повторить",
    );
    expect(preparationLabel({ ...status, status: "ready" })).toContain(
      "готовы",
    );
  });
  test("validates status/progress and accepts prepared replies from native transport", () => {
    expect(ScenarioAudioStatusSchema.safeParse(status).success).toBe(true);
    expect(
      ScenarioAudioStatusSchema.safeParse({ ...status, completed: -1 }).success,
    ).toBe(false);
    expect(
      ScenarioAudioStatusSchema.safeParse({ ...status, status: "unknown" })
        .success,
    ).toBe(false);
    expect(
      CallServerEventSchema.safeParse({
        type: "reply.text",
        text: "Учебная реплика",
        emotion: "calm",
        intensity: 0.2,
        source: "prepared",
      }).success,
    ).toBe(true);
  });
});
