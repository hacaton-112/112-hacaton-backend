import { describe, expect, it } from "bun:test";

import { SCALING_OPTIONS, scalingFactor } from "../src/config/theme";

describe("масштаб рабочего места", () => {
  it("доходит до 60 % и считает множитель темы", () => {
    expect(SCALING_OPTIONS).toContain("60%");
    expect(scalingFactor("60%")).toBe(0.6);
    expect(scalingFactor("100%")).toBe(1);
    expect(scalingFactor("130%")).toBe(1.3);
  });

  it("перечисляет шаги по возрастанию без повторов", () => {
    const factors = SCALING_OPTIONS.map(scalingFactor);
    expect(new Set(factors).size).toBe(factors.length);
    expect([...factors].sort((left, right) => left - right)).toEqual(factors);
  });
});
