import { describe, expect, it } from "bun:test";

import {
  categoryAppearance,
  criticalQuestionsLabel,
  formatClock,
  scenarioCountLabel,
} from "../src/components/scenario-catalog/scenario-catalog-formatters";

describe("scenario catalog formatters", () => {
  it("shows the expected call length as minutes and seconds", () => {
    expect(formatClock(372)).toBe("06:12");
    expect(formatClock(30)).toBe("00:30");
    expect(formatClock(3_600)).toBe("60:00");
  });

  it("counts scenarios in proper Russian", () => {
    expect(scenarioCountLabel(0)).toBe("Опубликованных сценариев нет");
    expect(scenarioCountLabel(1)).toBe("Доступен 1 сценарий");
    expect(scenarioCountLabel(3)).toBe("Доступно 3 сценария");
    expect(scenarioCountLabel(5)).toBe("Доступно 5 сценариев");
    expect(scenarioCountLabel(11)).toBe("Доступно 11 сценариев");
    expect(scenarioCountLabel(21)).toBe("Доступен 21 сценарий");
    expect(scenarioCountLabel(24)).toBe("Доступно 24 сценария");
  });

  it("counts critical questions", () => {
    expect(criticalQuestionsLabel(1)).toBe("1 критичный");
    expect(criticalQuestionsLabel(4)).toBe("4 критичных");
  });

  it("gives every known category its label and colour", () => {
    expect(categoryAppearance("fire")).toEqual({ label: "Пожар", tone: "red" });
    expect(categoryAppearance("road_accident")).toEqual({
      label: "ДТП",
      tone: "orange",
    });
  });

  it("shows an unknown category as it came, in grey", () => {
    expect(categoryAppearance("flood")).toEqual({
      label: "flood",
      tone: "gray",
    });
  });
});
