import { describe, expect, test } from "bun:test";

import { MethodicalMaterialListSchema } from "../src/contracts/methodical-materials";

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
          completedSections: 1,
          totalSections: 1,
          sections: [
            {
              id: "opening",
              title: "Начало",
              summary: "Установите контакт",
              items: ["Представьтесь"],
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
});
