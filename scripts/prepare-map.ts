import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONCURRENCY = 16;
const FONT_UPSTREAM = "https://tiles.basemaps.cartocdn.com/fonts";
const FONT_STACKS = [
  "Montserrat Medium Italic,Open Sans Italic,Noto Sans Regular,HanWangHeiLight Regular,NanumBarunGothic Regular",
  "Montserrat Medium,Open Sans Bold,Noto Sans Regular,HanWangHeiLight Regular,NanumBarunGothic Regular",
  "Montserrat Regular Italic,Open Sans Italic,Noto Sans Regular,HanWangHeiLight Regular,NanumBarunGothic Regular",
  "Montserrat Regular,Open Sans Regular,Noto Sans Regular,HanWangHeiLight Regular,NanumBarunGothic Regular",
] as const;

async function prepareFonts(): Promise<void> {
  const fontsRoot = resolve("maps/fonts");
  const jobs = FONT_STACKS.flatMap((fontstack) =>
    Array.from({ length: 256 }, (_, index) => ({
      fontstack,
      range: `${index * 256}-${index * 256 + 255}.pbf`,
    })),
  );
  let next = 0;
  let completed = 0;

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (true) {
        const index = next;
        next += 1;
        const job = jobs[index];
        if (!job) return;
        // TileServer разбирает набор на отдельные шрифты и ищет каждый по
        // его собственному имени, поэтому диапазоны набора кладутся в каталог
        // первого шрифта: остальных в наборе всё равно нет.
        const directory = resolve(
          fontsRoot,
          job.fontstack.split(",")[0]!.trim(),
        );
        await mkdir(directory, { recursive: true });
        const response = await fetch(
          `${FONT_UPSTREAM}/${encodeURIComponent(job.fontstack)}/${job.range}`,
          { signal: AbortSignal.timeout(15_000) },
        );
        if (!response.ok) {
          throw new Error(
            `Не удалось скачать glyph ${job.fontstack}/${job.range}: HTTP ${response.status}`,
          );
        }
        await writeFile(
          resolve(directory, job.range),
          new Uint8Array(await response.arrayBuffer()),
        );
        completed += 1;
        if (completed % 64 === 0 || completed === jobs.length) {
          process.stdout.write(`\rGlyphs: ${completed}/${jobs.length}`);
        }
      }
    }),
  );
  console.log();
}

// Тайлы собирает Planetiler (scripts/prepare-russia-map.ts). Здесь остаются
// только glyphs: они нужны стилю и весят около 12 МБ.
prepareFonts().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
