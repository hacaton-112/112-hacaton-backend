import {
  CreateDdsLessonSchema,
  NextDdsLessonCardResponseSchema,
} from "@/modules/dds-exercise/dto/dds-lesson.dto";

const eventId = "70dfbf42-ec3b-4f3d-8d98-a415bc90ded6";
const groupId = "70dfbf42-ec3b-4f3d-8d98-a415bc90deda";

describe("DDS lesson DTO", () => {
  it("accepts multiple categories and each supported lesson source", () => {
    for (const cardSource of ["generated", "operator_call", "mixed"] as const) {
      expect(
        CreateDdsLessonSchema.safeParse({
          eventId,
          groupId,
          title: "Практическое занятие",
          categories: ["fire", "medical"],
          cardSource,
          acknowledgementNormSeconds: 30,
          passThreshold: 75,
        }).success,
      ).toBe(true);
    }
  });

  it("does not accept tickets or two targets for a new lesson", () => {
    const base = {
      eventId,
      groupId,
      title: "Практическое занятие",
      categories: ["fire"],
      acknowledgementNormSeconds: 30,
      passThreshold: 75,
    };
    expect(
      CreateDdsLessonSchema.safeParse({ ...base, cardSource: "ticket" })
        .success,
    ).toBe(false);
    expect(
      CreateDdsLessonSchema.safeParse({
        ...base,
        cardSource: "generated",
        targetUserId: "70dfbf42-ec3b-4f3d-8d98-a415bc90ded1",
      }).success,
    ).toBe(false);
  });

  it("keeps empty and ready responses structurally distinct", () => {
    expect(
      NextDdsLessonCardResponseSchema.safeParse({
        status: "empty",
        reason: "Карточек нет",
      }).success,
    ).toBe(true);
    expect(
      NextDdsLessonCardResponseSchema.safeParse({ status: "empty" }).success,
    ).toBe(false);
  });
});
