import { describe, expect, test } from "bun:test";

import {
  DdsMyResultSchema,
  DdsMyResultsSchema,
} from "../src/contracts/dds-report";

const id = (suffix: string) =>
  `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

const card = {
  exerciseId: id("1"),
  operatorId: id("2"),
  operatorName: "Иван Стажёр",
  scenarioVersionId: id("3"),
  scenarioCode: "FIRE-01",
  scenarioTitle: "Пожар",
  finalStatus: "completed",
  expectedOutcome: "accept" as const,
  outcomeMatched: true,
  timeline: [
    {
      sequence: 1,
      status: "pending",
      comment: null,
      occurredAt: "2026-09-22T10:00:00.000Z",
      elapsedSeconds: 0,
    },
  ],
  timing: {
    reactionSeconds: 20,
    reactionNormSeconds: 30,
    reactionWithinNorm: true,
    completionSeconds: 180,
    completionNormSeconds: 600,
    completionWithinNorm: true,
  },
  processErrors: [],
  coverage: [
    {
      id: "address",
      label: "Адрес",
      status: "present" as const,
      quote: "Учебная, 1",
    },
  ],
  contradictions: [],
  grammar: null,
  automaticScore: 90,
  instructorReview: { score: 95, comment: "Хорошая работа" },
  finalScore: 95,
};

describe("DDS report contracts", () => {
  test("reads the trainee attempt list", () => {
    const result = DdsMyResultsSchema.parse({
      lessons: [
        {
          lessonId: id("4"),
          title: "Практика",
          status: "finished",
          startedAt: "2026-09-22T10:00:00.000Z",
          finishedAt: "2026-09-22T11:00:00.000Z",
          cards: 1,
          averageScore: 95,
          attempts: [
            {
              exerciseId: card.exerciseId,
              scenarioCode: card.scenarioCode,
              scenarioTitle: card.scenarioTitle,
              finalStatus: card.finalStatus,
              finalScore: card.finalScore,
            },
          ],
        },
      ],
    });
    expect(result.lessons[0]?.attempts[0]?.exerciseId).toBe(card.exerciseId);
  });

  test("reads a detailed result without exposing reference hints", () => {
    const result = DdsMyResultSchema.parse({
      lesson: {
        id: id("4"),
        title: "Практика",
        status: "finished",
        startedAt: "2026-09-22T10:00:00.000Z",
        finishedAt: "2026-09-22T11:00:00.000Z",
        acknowledgementNormSeconds: 30,
        passThreshold: 75,
      },
      card,
    });
    expect(result.card.finalScore).toBe(95);
    expect("hint" in result.card).toBe(false);
  });
});
