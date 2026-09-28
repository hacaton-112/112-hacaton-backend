import { describe, expect, test } from "bun:test";

import { DDS_STATUS_LABELS } from "../src/components/dds/dds-formatters";
import { CATEGORY_LABELS } from "../src/contracts/scenario-authoring";
import { labelFor } from "../src/lib/labels";

describe("подписи значений", () => {
  test("незнакомое значение показывается подписью, а не кодом", () => {
    expect(labelFor({ fire: "Пожар" }, "road_accident", "Прочее")).toBe(
      "Прочее",
    );
    expect(labelFor({ fire: "Пожар" }, null)).toBe("—");
  });

  test("известное значение показывается подписью", () => {
    expect(labelFor(DDS_STATUS_LABELS, "accepted")).toBe("Принята");
    expect(labelFor(CATEGORY_LABELS, "road_accident")).toBe("ДТП");
  });

  test("ни одна подпись категорий и статусов ДДС не написана кодом", () => {
    const labels = [
      ...Object.values(CATEGORY_LABELS),
      ...Object.values(DDS_STATUS_LABELS),
    ];

    for (const label of labels) {
      expect(label).not.toMatch(/^[a-z_]+$/u);
    }
  });
});
