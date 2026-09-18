import { describe, expect, it } from "bun:test";

import { DebriefSchema } from "../src/contracts/debrief";
import { GrammarReportSchema } from "../src/contracts/grammar";
import { shortenFragment } from "../src/lib/grammar-text";

const debrief = (overrides: Record<string, unknown> = {}) => ({
  call: {
    trainingSessionId: "session-1",
    scenarioCode: "S-015",
    title: "Пожар в жилом доме",
    stage: "ended",
    offeredAt: "2026-09-16T10:00:00.000Z",
    answeredAt: "2026-09-16T10:00:09.000Z",
    endedAt: "2026-09-16T10:04:09.000Z",
    durationSeconds: 240,
  },
  timings: {
    answerSeconds: 9,
    answerNormSeconds: 240,
    durationSeconds: 240,
    expectedDurationSeconds: 360,
  },
  finalPanicLevel: 3,
  timeline: [],
  facts: [],
  questions: [],
  incidentCard: null,
  evaluation: null,
  recording: [],
  recordingUrl: null,
  ...overrides,
});

describe("grammar in the debrief", () => {
  it("reads the report the backend sends", () => {
    const parsed = DebriefSchema.parse(
      debrief({
        grammar: {
          fields: [
            {
              id: "description",
              label: "Описание происшествия",
              issues: [
                {
                  kind: "mixed-alphabet",
                  severity: "error",
                  offset: 0,
                  length: 5,
                  fragment: "Пoжар",
                  message: "В русском слове латинские буквы.",
                  suggestion: "Пожар",
                },
              ],
              errorCount: 1,
              styleCount: 0,
            },
          ],
          errorCount: 1,
          styleCount: 0,
          reviewedByModel: false,
        },
      }),
    );

    expect(parsed.grammar?.fields[0]?.issues[0]?.suggestion).toBe("Пожар");
  });

  it("opens a debrief from a backend that does not check grammar yet", () => {
    // Приложение и backend обновляются не одновременно: без поля разбор
    // обязан открыться, а раздел — просто не показаться.
    expect(DebriefSchema.parse(debrief()).grammar).toBeUndefined();
  });

  it("keeps a correction optional", () => {
    const report = GrammarReportSchema.parse({
      fields: [
        {
          id: "placeNotes",
          label: "Примечания к месту",
          issues: [
            {
              kind: "model-review",
              severity: "error",
              offset: 3,
              length: 6,
              fragment: "поехал",
              message: "Проверьте окончание.",
              suggestion: null,
            },
          ],
          errorCount: 1,
          styleCount: 0,
        },
      ],
      errorCount: 1,
      styleCount: 0,
      reviewedByModel: true,
    });

    expect(report.fields[0]?.issues[0]?.suggestion).toBeNull();
  });
});

describe("показ замечания", () => {
  it("обрезает фрагмент, которым стало всё поле", () => {
    // Замечание к набранному заглавными описанию относится ко всему тексту.
    const shouted = "ГОРИТ КРЫША ".repeat(20).trim();

    const shown = shortenFragment(shouted);

    expect(shown.length).toBeLessThanOrEqual(121);
    expect(shown.endsWith("…")).toBe(true);
    expect(shouted.startsWith(shown.slice(0, -1))).toBe(true);
  });

  it("оставляет короткий фрагмент как есть", () => {
    expect(shortenFragment("пoжар")).toBe("пoжар");
  });
});
