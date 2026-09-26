import { ddsLiveFindings } from "@/modules/dds-exercise/domain/dds-live-findings";

const deadline = new Date("2026-09-15T12:00:30.000Z");
const acknowledged = new Date("2026-09-15T12:00:20.000Z");

describe("ddsLiveFindings", () => {
  it("stays silent while the norm is still running", () => {
    expect(
      ddsLiveFindings({
        acknowledgementDeadlineAt: deadline,
        acknowledgedAt: null,
        now: new Date("2026-09-15T12:00:25.000Z"),
      }),
    ).toEqual([]);
  });

  it("reports a norm that ran out without a primary status", () => {
    expect(
      ddsLiveFindings({
        acknowledgementDeadlineAt: deadline,
        acknowledgedAt: null,
        now: new Date("2026-09-15T12:00:31.000Z"),
      }),
    ).toEqual(["acknowledgement_overdue"]);
  });

  it("keeps the late primary status visible after it happened", () => {
    expect(
      ddsLiveFindings({
        acknowledgementDeadlineAt: deadline,
        acknowledgedAt: new Date("2026-09-15T12:00:45.000Z"),
        now: new Date("2026-09-15T12:02:00.000Z"),
      }),
    ).toEqual(["acknowledged_late"]);
  });

  it("counts the crew norm from the moment the card was accepted", () => {
    const input = {
      acknowledgementDeadlineAt: deadline,
      acknowledgedAt: acknowledged,
      handoff: { completedCallStartedAt: null, wrongCallsBefore: 0 },
    };

    expect(
      ddsLiveFindings({ ...input, now: new Date("2026-09-15T12:01:10.000Z") }),
    ).toEqual([]);
    expect(
      ddsLiveFindings({ ...input, now: new Date("2026-09-15T12:01:25.000Z") }),
    ).toEqual(["crew_handoff_overdue"]);
  });

  it("keeps a late crew call and a wrong number apart", () => {
    expect(
      ddsLiveFindings({
        acknowledgementDeadlineAt: deadline,
        acknowledgedAt: acknowledged,
        handoff: {
          completedCallStartedAt: new Date("2026-09-15T12:02:00.000Z"),
          wrongCallsBefore: 2,
        },
        now: new Date("2026-09-15T12:02:30.000Z"),
      }),
    ).toEqual(["crew_handoff_overdue", "wrong_crew_dialed"]);
  });

  it("says nothing about the crew while telephony is off", () => {
    expect(
      ddsLiveFindings({
        acknowledgementDeadlineAt: deadline,
        acknowledgedAt: acknowledged,
        now: new Date("2026-09-15T12:05:00.000Z"),
      }),
    ).toEqual([]);
  });
});
