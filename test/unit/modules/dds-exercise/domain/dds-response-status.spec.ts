import {
  allowedDdsTransitions,
  DdsTransitionError,
  validateDdsTransition,
} from "@/modules/dds-exercise/domain/dds-response-status";

describe("DDS response status", () => {
  it("starts with the two primary acknowledgement statuses", () => {
    expect(allowedDdsTransitions("pending")).toEqual([
      "accepted",
      "not_accepted",
    ]);
  });

  it("only exposes sequential progress after acceptance", () => {
    expect(allowedDdsTransitions("accepted")).toEqual([
      "responding",
      "refused",
    ]);
    expect(allowedDdsTransitions("responding")).toEqual(["arrived", "refused"]);
    expect(allowedDdsTransitions("arrived")).toEqual(["working", "refused"]);
    expect(allowedDdsTransitions("working")).toEqual(["completed", "refused"]);
  });

  it("allows a service to accept a card after initially not accepting it", () => {
    expect(allowedDdsTransitions("not_accepted")).toEqual(["accepted"]);
  });

  it("keeps instructor lesson completion terminal and unavailable to operators", () => {
    expect(allowedDdsTransitions("lesson_finished")).toEqual([]);
    expect(() =>
      validateDdsTransition({
        current: "pending",
        next: "lesson_finished",
      }),
    ).toThrow(new DdsTransitionError("invalid-transition"));
  });

  it("requires a meaningful comment for not accepted and refusal", () => {
    for (const next of ["not_accepted", "refused"] as const) {
      const current = next === "not_accepted" ? "pending" : "accepted";

      expect(() =>
        validateDdsTransition({ current, next, comment: "   " }),
      ).toThrow(new DdsTransitionError("comment-required"));
    }
  });

  it("normalizes an optional comment and rejects a skipped stage", () => {
    expect(
      validateDdsTransition({
        current: "accepted",
        next: "responding",
        comment: "  Выезд подтверждён  ",
      }),
    ).toBe("Выезд подтверждён");

    expect(() =>
      validateDdsTransition({ current: "accepted", next: "completed" }),
    ).toThrow(new DdsTransitionError("invalid-transition"));
  });
});
