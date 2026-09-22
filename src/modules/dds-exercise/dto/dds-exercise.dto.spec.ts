import {
  DispatchIncidentCardRequestSchema,
  StartDdsExerciseRequestSchema,
  TransitionDdsExerciseRequestSchema,
} from "./dds-exercise.dto";

const eventId = "2db691f0-3816-4f19-9b43-64f34059db71";

describe("DDS exercise DTO", () => {
  it("requires UUID command identifiers for idempotency", () => {
    expect(
      StartDdsExerciseRequestSchema.safeParse({
        scenarioVersionId: "77f32f29-48dc-4de1-b29c-c8d251ee53a2",
        eventId,
      }).success,
    ).toBe(true);
    expect(
      StartDdsExerciseRequestSchema.safeParse({
        scenarioVersionId: "scenario-1",
        eventId,
      }).success,
    ).toBe(false);
    expect(
      DispatchIncidentCardRequestSchema.safeParse({ eventId }).success,
    ).toBe(true);
  });

  it("does not let the client transition an exercise back to pending", () => {
    expect(
      TransitionDdsExerciseRequestSchema.safeParse({
        eventId,
        status: "pending",
      }).success,
    ).toBe(false);
    expect(
      TransitionDdsExerciseRequestSchema.safeParse({
        eventId,
        status: "lesson_finished",
      }).success,
    ).toBe(false);
  });

  it("accepts a refusal comment but leaves its requirement to the domain", () => {
    expect(
      TransitionDdsExerciseRequestSchema.parse({
        eventId,
        status: "refused",
        comment: "Нет свободного экипажа",
      }),
    ).toMatchObject({ status: "refused" });
  });
});
