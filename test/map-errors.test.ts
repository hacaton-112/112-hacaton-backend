import { describe, expect, it } from "bun:test";

import { isMissingTileError, mapFailureText } from "../src/lib/map-errors";

describe("ошибки карты", () => {
  it("не считает сбоем пустой квадрат за границей детализации", () => {
    expect(isMissingTileError({ status: 404 })).toBe(true);
    expect(isMissingTileError({ status: 204 })).toBe(true);
  });

  it("считает сбоем всё остальное", () => {
    expect(isMissingTileError({ status: 500 })).toBe(false);
    expect(isMissingTileError(new Error("style is not done loading"))).toBe(
      false,
    );
    expect(isMissingTileError(undefined)).toBe(false);
  });
});

describe("сообщение о сбое карты", () => {
  it("называет причину, когда она известна", () => {
    expect(mapFailureText(new Error("Failed to fetch"))).toBe(
      "Карта не загрузилась: Failed to fetch",
    );
  });

  it("обходится без причины, когда её нет", () => {
    expect(mapFailureText(undefined)).toBe("Карта не загрузилась");
  });
});
