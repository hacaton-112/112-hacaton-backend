import {
  copyFile,
  link,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";

// Образ несёт Москву с областью (scripts/extract-map-region.ts): ~0.5 ГБ
// вместо 10 ГБ всей России, поэтому данные можно запечь прямо в образ.
const REGION_FILE = "moscow-oblast.mbtiles";
const IMAGE_NAME = "system-112-training-map";
const tag = `moscow-${new Date().toISOString().slice(0, 10)}`;
const image = `${IMAGE_NAME}:${tag}`;
const outputRoot = resolve("var/map-image");
const context = join(outputRoot, "context");
const archive = join(outputRoot, `${IMAGE_NAME}-${tag}.tar`);

async function run(command: string, args: string[], env = process.env) {
  await new Promise<void>((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env, shell: false });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolveRun();
      else
        reject(new Error(`${command} завершился с кодом ${code ?? "unknown"}`));
    });
  });
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return nested.flat();
}

async function linkOrCopy(source: string, target: string) {
  await mkdir(dirname(target), { recursive: true });
  try {
    await link(source, target);
  } catch {
    await copyFile(source, target);
  }
}

async function copyTree(source: string, target: string) {
  for (const file of await listFiles(source)) {
    await linkOrCopy(file, join(target, relative(source, file)));
  }
}

async function main() {
  const regionPath = resolve("maps/data", REGION_FILE);
  await run("bun", ["scripts/extract-map-region.ts"]);
  await run("bun", ["scripts/check-map-data.ts"], {
    ...process.env,
    MAP_MBTILES_PATH: regionPath,
  });

  const fonts = (await listFiles(resolve("maps/fonts"))).filter((path) =>
    path.endsWith(".pbf"),
  );
  if (fonts.length === 0) {
    throw new Error(
      "В maps/fonts нет glyphs. Выполните bun run map:prepare:fonts.",
    );
  }

  await rm(context, { recursive: true, force: true });
  await mkdir(context, { recursive: true });
  for (const directory of ["styles", "sprites", "fonts"]) {
    await copyTree(resolve("maps", directory), join(context, directory));
  }
  await linkOrCopy(regionPath, join(context, "data", REGION_FILE));

  const config = JSON.parse(
    await readFile(resolve("maps/config.json"), "utf8"),
  ) as {
    options: { paths: { root: string } };
    data: Record<string, { mbtiles: string }>;
  };
  config.options.paths.root = "/map";
  for (const source of Object.values(config.data)) source.mbtiles = REGION_FILE;
  await writeFile(
    join(context, "config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
  );

  await run("docker", [
    "build",
    "-t",
    image,
    "-f",
    resolve("maps/Dockerfile"),
    context,
  ]);
  await rm(archive, { force: true });
  await run("docker", ["save", "-o", archive, image]);
  await rm(context, { recursive: true, force: true });

  const size = (await stat(archive)).size / 1024 ** 2;
  console.log(`Образ: ${image}`);
  console.log(`Архив: ${archive} (${size.toFixed(0)} МБ)`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
