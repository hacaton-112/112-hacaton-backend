import {
  everyLearnerFinished,
  learnerFinished,
  type LessonAttempt,
} from "@/modules/training/domain/lesson-completion";

const passed: LessonAttempt = { status: "completed", passed: true };
const failed: LessonAttempt = { status: "completed", passed: false };
const running: LessonAttempt = { status: "active", passed: false };

describe(learnerFinished.name, () => {
  it("считает ученика закончившим, если он сдал с первой из трёх попыток", () => {
    expect(learnerFinished([passed], 3)).toBe(true);
  });

  it("оставляет занятие открытым, пока у незачтённого ученика есть попытки", () => {
    expect(learnerFinished([failed], 3)).toBe(false);
  });

  it("считает ученика закончившим, когда попытки исчерпаны", () => {
    expect(learnerFinished([failed, failed, failed], 3)).toBe(true);
  });

  it("не закрывает занятие, пока попытка идёт", () => {
    expect(learnerFinished([passed, running], 3)).toBe(false);
  });

  it("без лимита незачтённый ученик занятие не заканчивает", () => {
    expect(learnerFinished([failed, failed, failed, failed], null)).toBe(false);
  });

  it("не считает закончившим того, кто не начинал", () => {
    expect(learnerFinished([], 3)).toBe(false);
  });
});

describe(everyLearnerFinished.name, () => {
  it("ждёт всех, кому адресовано занятие", () => {
    const attempts = new Map([
      ["ivanova", [passed]],
      ["smirnov", [failed]],
    ]);

    expect(everyLearnerFinished(["ivanova", "smirnov"], attempts, 3)).toBe(
      false,
    );
    expect(everyLearnerFinished(["ivanova"], attempts, 3)).toBe(true);
  });

  it("не закрывает занятие без адресатов", () => {
    expect(everyLearnerFinished([], new Map(), 3)).toBe(false);
  });
});
