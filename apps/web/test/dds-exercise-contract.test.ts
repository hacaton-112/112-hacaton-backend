import { describe, expect, it } from "bun:test";

import {
  acknowledgementSecondsLeft,
  ddsTextEvaluationMode,
  formatCountdown,
  requiresComment,
} from "../src/components/dds/dds-formatters";
import { DdsExerciseSchema } from "../src/contracts/dds-exercise";

const exercise = {
  id: "68e4085a-a84f-435e-804f-8a242db80385",
  scenarioVersionId: "a95237ec-cf7c-4139-a96f-c6201800fd4f",
  trainingAttemptId: null,
  sourceTrainingSessionId: "session-1",
  addressedService: "dds_01",
  status: "pending",
  allowedTransitions: ["accepted", "not_accepted"],
  card: {
    scenarioCode: "S-FIRE-01",
    title: "Пожар в квартире",
    summary: "На пятом этаже горит квартира.",
    category: "fire",
    addressText: "Москва, Учебная улица, 12",
    latitude: 55.75,
    longitude: 37.61,
    callerName: "Анна Максутова",
    callerPhone: "+79990000000",
    incidentType: "Пожар",
    description: "Дым из окна квартиры",
    victimsTotal: 1,
    services: ["dds_01", "dds_03"],
  },
  acknowledgementDeadlineAt: "2026-09-15T12:00:30.000Z",
  acknowledgedAt: null,
  completedAt: null,
  createdAt: "2026-09-15T12:00:00.000Z",
  updatedAt: "2026-09-15T12:00:00.000Z",
  events: [
    {
      sequence: 1,
      eventId: "e29a7c15-c910-4ae9-a778-d9a3d76e0bc7",
      actorId: null,
      fromStatus: null,
      toStatus: "pending",
      comment: null,
      occurredAt: "2026-09-15T12:00:00.000Z",
    },
  ],
  result: null,
};

describe("DDS exercise contract", () => {
  it("accepts a complete backend exercise projection", () => {
    expect(DdsExerciseSchema.parse(exercise).card.services).toEqual([
      "dds_01",
      "dds_03",
    ]);
  });

  it("rejects a status unknown to the workflow", () => {
    expect(
      DdsExerciseSchema.safeParse({ ...exercise, status: "dispatched" })
        .success,
    ).toBe(false);
  });

  it("parses deterministic result violations", () => {
    const parsed = DdsExerciseSchema.parse({
      ...exercise,
      status: "refused",
      allowedTransitions: [],
      result: {
        score: 60,
        passed: false,
        acknowledgementMet: true,
        terminalStatus: "refused",
        violations: ["response_refused"],
      },
    });

    expect(parsed.result?.violations).toEqual(["response_refused"]);
  });

  it("counts down from the server deadline and clamps at zero", () => {
    expect(
      acknowledgementSecondsLeft(
        exercise.acknowledgementDeadlineAt,
        Date.parse("2026-09-15T12:00:01.000Z"),
      ),
    ).toBe(29);
    expect(
      acknowledgementSecondsLeft(
        exercise.acknowledgementDeadlineAt,
        Date.parse("2026-09-15T12:01:00.000Z"),
      ),
    ).toBe(0);
    expect(formatCountdown(29)).toBe("00:29");
  });

  it("marks the two statuses whose comment is mandatory", () => {
    expect(requiresComment("not_accepted")).toBe(true);
    expect(requiresComment("refused")).toBe(true);
    expect(requiresComment("accepted")).toBe(false);
  });

  it("keeps the result preliminary until asynchronous text evaluation finishes", () => {
    expect(ddsTextEvaluationMode(null)).toBe("preliminary");
    expect(
      ddsTextEvaluationMode({
        status: "pending",
        preliminary: true,
        coverage: [],
        contradictions: [],
        summary: null,
        grammar: null,
        model: null,
        durationMs: null,
        error: null,
      }),
    ).toBe("preliminary");
  });

  it("distinguishes a completed breakdown from a failed fallback", () => {
    const base = {
      preliminary: false,
      coverage: [],
      contradictions: [],
      summary: null,
      grammar: null,
      model: null,
      durationMs: null,
      error: null,
    } as const;
    expect(ddsTextEvaluationMode({ ...base, status: "done" })).toBe("done");
    expect(ddsTextEvaluationMode({ ...base, status: "failed" })).toBe(
      "unavailable",
    );
  });
});
