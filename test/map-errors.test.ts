import { describe, expect, it } from "bun:test";

import { isMissingTileError } from "../src/lib/map-errors";

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
