import { hasMoreToDelete, retentionCutoff } from "@/modules/audit-log/domain/retention";

describe("срок хранения журнала аудита", () => {
  it("отсчитывает границу назад от текущего момента", () => {
    const now = new Date("2026-09-24T10:00:00.000Z");

    expect(retentionCutoff(now, 365)).toEqual(
      new Date("2025-09-24T10:00:00.000Z"),
    );
    expect(retentionCutoff(now, 30)).toEqual(
      new Date("2026-08-25T10:00:00.000Z"),
    );
  });

  it("не принимает срок короче суток: иначе уборка снесёт свежие записи", () => {
    const now = new Date("2026-09-24T10:00:00.000Z");

    expect(() => retentionCutoff(now, 0)).toThrow(RangeError);
    expect(() => retentionCutoff(now, Number.NaN)).toThrow(RangeError);
  });

  it("продолжает уборку, пока партия приходит целиком", () => {
    expect(hasMoreToDelete(500, 500)).toBe(true);
    expect(hasMoreToDelete(499, 500)).toBe(false);
    expect(hasMoreToDelete(0, 500)).toBe(false);
  });
});
