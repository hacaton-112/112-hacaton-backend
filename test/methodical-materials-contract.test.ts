import { describe, expect, test } from "bun:test";

import {
  MethodicalMaterialInputSchema,
  MethodicalMaterialListSchema,
} from "../src/contracts/methodical-materials";

describe("methodical materials contract", () => {
  test("parses role-filtered materials with section progress", () => {
    const result = MethodicalMaterialListSchema.parse({
      materials: [
        {
          id: "operator-112",
          title: "Работа оператора",
          description: "Алгоритм работы",
          audience: "Операторы",
          durationMinutes: 25,
          roles: ["operator"],
          updatedAt: null,
          completedSections: 1,
          totalSections: 1,
          sections: [
            {
              id: "opening",
              title: "Начало",
              summary: "Установите контакт",
              items: ["Представьтесь"],
              contentMarkdown: "- Представьтесь",
              completed: true,
              completedAt: "2026-09-17T10:00:00.000Z",
            },
          ],
        },
      ],
    });
    expect(result.materials[0]?.sections[0]?.completed).toBe(true);
  });

  test("rejects incomplete progress data", () => {
    expect(() =>
      MethodicalMaterialListSchema.parse({
        materials: [{ id: "operator-112" }],
      }),
    ).toThrow();
  });

  test("validates an editable markdown material", () => {
    const parsed = MethodicalMaterialInputSchema.parse({
      title: "Памятка оператора",
      description: "Алгоритм обработки вызова",
      audience: "Операторы",
      durationMinutes: 20,
      roles: ["operator"],
      sections: [
        {
          title: "Начало разговора",
          summary: "Установите контакт с заявителем",
          contentMarkdown:
            "## Порядок\n\n1. Представьтесь.\n2. Уточните адрес.",
        },
      ],
    });

    expect(parsed.sections[0]?.contentMarkdown).toContain("## Порядок");
  });
});
