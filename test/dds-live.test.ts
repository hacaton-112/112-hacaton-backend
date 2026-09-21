import { describe, expect, test } from "bun:test";

import {
  DDS_LIVE_FINDINGS,
  DDS_LIVE_FINDING_LABELS,
  DdsLiveListSchema,
} from "../src/contracts/dds-training";

const attempt = {
  exerciseId: "68e4085a-a84f-435e-804f-8a242db80385",
  assignmentId: "a95237ec-cf7c-4139-a96f-c6201800fd4f",
  assignmentTitle: "Смена ДДС-01",
  operatorId: "b78c7133-0a9e-4562-9307-0c277046d780",
  operatorName: "Анна Максутова",
  attemptNumber: 1,
  startedAt: "2026-09-15T12:00:00.000Z",
  addressedService: "dds_01",
  cardTitle: "Пожар в квартире",
  status: "pending",
  acknowledgementDeadlineAt: "2026-09-15T12:00:30.000Z",
  acknowledgedAt: null,
  findings: ["acknowledgement_overdue"],
};

describe("live DDS attempts", () => {
  test("parses the monitoring projection of a running attempt", () => {
    const parsed = DdsLiveListSchema.parse({ attempts: [attempt] });

    expect(parsed.attempts[0]!.findings).toEqual(["acknowledgement_overdue"]);
    expect(parsed.attempts[0]!.acknowledgedAt).toBeNull();
  });

  test("rejects a finding the interface cannot explain", () => {
    expect(
      DdsLiveListSchema.safeParse({
        attempts: [{ ...attempt, findings: ["card_ignored"] }],
      }).success,
    ).toBe(false);
  });

  test("explains every finding the backend can send", () => {
    for (const finding of DDS_LIVE_FINDINGS) {
      expect(DDS_LIVE_FINDING_LABELS[finding]).toBeTruthy();
    }
  });
});
