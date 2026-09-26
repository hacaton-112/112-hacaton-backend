import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface JournalEntry {
  readonly idx: number;
  readonly when: number;
  readonly tag: string;
}

interface MigrationJournal {
  readonly entries: readonly JournalEntry[];
}

describe("migration journal", () => {
  const migrationsDirectory = join(process.cwd(), "drizzle", "migrations");
  const journal = JSON.parse(
    readFileSync(join(migrationsDirectory, "meta", "_journal.json"), "utf8"),
  ) as MigrationJournal;

  it("keeps migration order strictly increasing", () => {
    for (const [position, entry] of journal.entries.entries()) {
      expect(entry.idx).toBe(position);

      if (position > 0) {
        expect(entry.when).toBeGreaterThan(journal.entries[position - 1].when);
      }
    }
  });

  it("uses each migration tag once and references an existing SQL file", () => {
    const tags = journal.entries.map(({ tag }) => tag);

    expect(new Set(tags).size).toBe(tags.length);

    for (const tag of tags) {
      expect(existsSync(join(migrationsDirectory, `${tag}.sql`))).toBe(true);
    }
  });
});
