import { rename, rm, statfs } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const dataDirectory = resolve("maps/data");
const destination = resolve(dataDirectory, "russia.mbtiles");
const partial = resolve(dataDirectory, "russia.partial.mbtiles");
const backup = resolve(dataDirectory, "russia.mbtiles.backup");
const tileserverContainer = "system-112-training-tileserver";
const minimumFreeBytes = 40 * 1024 ** 3;

async function run(command: string, args: string[], env = process.env) {
  await new Promise<void>((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env, shell: false });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} завершился с кодом ${code ?? "unknown"}`));
    });
  });
}

async function capture(command: string, args: string[]): Promise<string> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "inherit"],
      shell: false,
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", () => resolveRun(output.trim()));
  });
}

// TileServer держит russia.mbtiles открытым, поэтому на Windows подмена файла
// без остановки контейнера падает с EBUSY. Останавливаем только то, что
// действительно работало, и поднимаем обратно после успешной подмены.
async function isTileserverRunning(): Promise<boolean> {
  const output = await capture("docker", [
    "ps",
    "--quiet",
    "--filter",
    `name=${tileserverContainer}`,
    "--filter",
    "status=running",
  ]);
  return output.length > 0;
}

// --swap-only подхватывает уже собранный russia.partial.mbtiles: сборку заново
// запускать не нужно, если прервался только процесс-оркестратор.
const swapOnly = process.argv.includes("--swap-only");

async function main() {
  if (swapOnly) {
    await swap();
    return;
  }

  const disk = await statfs(dataDirectory);
  const freeBytes = disk.bavail * disk.bsize;
  if (freeBytes < minimumFreeBytes) {
    throw new Error(
      `Для сборки карты России нужно минимум 40 ГБ свободного места; доступно ${(freeBytes / 1024 ** 3).toFixed(1)} ГБ.`,
    );
  }

  await rm(partial, { force: true });
  console.log("Собираем OpenMapTiles России. Старый архив останется доступен до завершения сборки.");
  await run("docker", [
    "compose",
    "--profile",
    "map-build",
    "run",
    "--rm",
    "map-builder",
  ]);

  await swap();
}

async function swap() {
  await run("bun", ["scripts/check-map-data.ts"], {
    ...process.env,
    MAP_MBTILES_PATH: partial,
  });

  const restartTileserver = await isTileserverRunning();
  if (restartTileserver) {
    console.log("Останавливаем TileServer на время подмены архива.");
    await run("docker", ["compose", "--profile", "maps", "stop", "tileserver"]);
  }

  await rm(backup, { force: true });
  let hasBackup = false;
  try {
    await rename(destination, backup);
    hasBackup = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  try {
    // Журналы SQLite от прежнего архива нельзя оставлять рядом с новым файлом.
    await rm(`${destination}-wal`, { force: true });
    await rm(`${destination}-shm`, { force: true });
    await rename(partial, destination);
  } catch (error) {
    if (hasBackup) await rename(backup, destination);
    throw error;
  } finally {
    if (restartTileserver) {
      await run("docker", ["compose", "--profile", "maps", "up", "-d", "tileserver"]);
    }
  }
  if (hasBackup) await rm(backup, { force: true });

  await run("bun", ["scripts/prepare-map.ts"]);
  console.log(`Готово: ${destination}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
