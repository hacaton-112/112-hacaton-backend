import type { DrizzleService } from "@/core/database/drizzle.service";

import { AuditLogRetentionJanitor } from "@/modules/audit-log/application/audit-log-retention.janitor";

const NOW = new Date("2026-09-24T10:00:00.000Z");
const CUTOFF = new Date("2025-09-24T10:00:00.000Z");

/** Журнал в памяти: уборщика проверяем по тому, что из него исчезло. */
const fakeDatabase = (entries: { id: string; createdAt: Date }[]) => {
  let rows = [...entries];
  const selected: number[] = [];

  const db = {
    select: () => ({
      from: () => ({
        where: (condition: { cutoff: Date }) => ({
          limit: (batch: number) => {
            const page = rows
              .filter(({ createdAt }) => createdAt < condition.cutoff)
              .slice(0, batch)
              .map(({ id }) => ({ id }));
            selected.push(page.length);
            return Promise.resolve(page);
          },
        }),
      }),
    }),
    delete: () => ({
      where: (condition: { ids: string[] }) => {
        rows = rows.filter(({ id }) => !condition.ids.includes(id));
        return Promise.resolve(undefined);
      },
    }),
  } as unknown as DrizzleService["db"];

  return { db, remaining: () => rows, batches: () => selected };
};

jest.mock("drizzle-orm", () => ({
  lt: (_column: unknown, cutoff: Date) => ({ cutoff }),
  inArray: (_column: unknown, ids: string[]) => ({ ids }),
}));

const entry = (id: string, iso: string) => ({ id, createdAt: new Date(iso) });

describe(AuditLogRetentionJanitor.name, () => {
  it("удаляет записи старше срока и оставляет свежие", async () => {
    const journal = fakeDatabase([
      entry("old-1", "2024-01-01T00:00:00.000Z"),
      entry("old-2", "2025-09-23T00:00:00.000Z"),
      entry("fresh", "2026-09-01T00:00:00.000Z"),
    ]);
    const janitor = new AuditLogRetentionJanitor(journal.db, {
      enabled: true,
      retentionDays: 365,
    });

    await expect(janitor.sweep(NOW)).resolves.toBe(2);
    expect(journal.remaining().map(({ id }) => id)).toEqual(["fresh"]);
    expect(CUTOFF.toISOString()).toBe("2025-09-24T10:00:00.000Z");
  });

  it("вычищает журнал партиями, а не одним запросом", async () => {
    const entries = Array.from({ length: 1_200 }, (_value, index) =>
      entry(`old-${index}`, "2024-01-01T00:00:00.000Z"),
    );
    const journal = fakeDatabase(entries);
    const janitor = new AuditLogRetentionJanitor(journal.db, {
      enabled: true,
      retentionDays: 365,
    });

    await expect(janitor.sweep(NOW)).resolves.toBe(1_200);
    expect(journal.remaining()).toHaveLength(0);
    expect(journal.batches()).toEqual([500, 500, 200]);
  });

  it("ничего не трогает, когда уборка выключена", async () => {
    const journal = fakeDatabase([entry("old", "2020-01-01T00:00:00.000Z")]);
    const janitor = new AuditLogRetentionJanitor(journal.db, {
      enabled: false,
      retentionDays: 365,
    });

    await expect(janitor.sweep(NOW)).resolves.toBe(0);
    expect(journal.remaining()).toHaveLength(1);
  });

  it("переживает сбой базы и оставляет журнал на следующий проход", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.reject(new Error("database is away")),
          }),
        }),
      }),
    } as unknown as DrizzleService["db"];
    const janitor = new AuditLogRetentionJanitor(db, {
      enabled: true,
      retentionDays: 365,
    });

    await expect(janitor.sweep(NOW)).resolves.toBe(0);
  });
});
