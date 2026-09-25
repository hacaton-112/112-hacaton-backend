import { archiveOwner, archivePeriod, likePattern } from "@/modules/dds-exercise/domain/dds-archive-query";

describe("поиск по архиву карточек", () => {
  it("включает в период обе названные даты", () => {
    const { since, until } = archivePeriod("2026-09-01", "2026-09-03");

    expect(since).toEqual(new Date("2026-09-01T00:00:00.000Z"));
    // Карточка третьего числа в 23:59 всё ещё попадает в выборку.
    expect(until).toEqual(new Date("2026-09-04T00:00:00.000Z"));
  });

  it("допускает одну границу и пустой период", () => {
    expect(archivePeriod("2026-09-01").until).toBeNull();
    expect(archivePeriod(undefined, "2026-09-01").since).toBeNull();
    expect(archivePeriod()).toEqual({ since: null, until: null });
  });

  it("отвергает период, который кончается раньше начала", () => {
    expect(() => archivePeriod("2026-09-05", "2026-09-01")).toThrow(RangeError);
    expect(() => archivePeriod("не дата")).toThrow(RangeError);
  });

  it("ищет подстроку и не даёт запросу подставлять шаблоны", () => {
    expect(likePattern("Тверская")).toBe("%Тверская%");
    expect(likePattern("  дом 5  ")).toBe("%дом 5%");
    expect(likePattern("100%_")).toBe("%100\\%\\_%");
  });

  it("обучающемуся отдаёт только его карточки", () => {
    expect(archiveOwner("operator", "me", "someone-else")).toBe("me");
    expect(archiveOwner("instructor", "me")).toBeNull();
    expect(archiveOwner("instructor", "me", "student")).toBe("student");
    expect(archiveOwner("admin", "me")).toBeNull();
  });
});
