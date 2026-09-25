import { describe, expect, it } from "bun:test";

import {
  formatCoordinate,
  formatIncidentAddress,
} from "../src/services/incident-location";

describe("formatIncidentAddress", () => {
  it("writes city, street and house as one line", () => {
    expect(
      formatIncidentAddress({
        city: "Москва",
        street: "улица Учебная",
        house: "12",
        displayName: "12, улица Учебная, Тверской район, Москва, Россия",
      }),
    ).toBe("Москва, улица Учебная, 12");
  });

  it("skips the parts the provider did not return", () => {
    expect(
      formatIncidentAddress({
        city: "Москва",
        street: "Калужское шоссе",
        displayName: "Калужское шоссе, Москва, Россия",
      }),
    ).toBe("Москва, Калужское шоссе");
  });

  it("falls back to the full label when nothing could be split out", () => {
    expect(
      formatIncidentAddress({
        city: " ",
        displayName: "Лесопарк, Новомосковский административный округ",
      }),
    ).toBe("Лесопарк, Новомосковский административный округ");
  });
});

describe("formatCoordinate", () => {
  it("keeps six decimals, as precise as a click on the map", () => {
    expect(formatCoordinate(55.7512345678)).toBe("55.751235");
    expect(formatCoordinate(37.6)).toBe("37.600000");
  });
});
