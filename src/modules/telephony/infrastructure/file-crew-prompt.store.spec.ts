import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { crewPromptName } from "../domain/crew-phrases";
import { FileCrewPromptStore } from "./file-crew-prompt.store";

const speech = (sampleRate: number, bytes: number[]) =>
  jest.fn(async function* () {
    yield {
      type: "audio.chunk" as const,
      chunk: {
        streamId: "s",
        sequence: 0,
        sampleRate,
        channels: 1 as const,
        format: "pcm_s16le" as const,
        isFinal: true,
        audio: new Uint8Array(bytes),
      },
    };
  });

describe(FileCrewPromptStore.name, () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "crew-prompts-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("stores synthesized speech as signed linear at its own rate", async () => {
    const synthesize = speech(24_000, [1, 2, 3, 4]);
    const store = new FileCrewPromptStore(dir, { synthesize } as never);

    const media = await store.ensure("Принял.", "ryan");
    const name = crewPromptName("Принял.", "ryan");

    expect(media).toBe(`sound:crew/${name}`);
    expect([...(await readFile(join(dir, "crew", `${name}.sln24`)))]).toEqual([
      1, 2, 3, 4,
    ]);
    expect(await readdir(join(dir, "crew"))).toEqual([`${name}.sln24`]);
  });

  it("synthesizes a line once, even for calls that arrive together", async () => {
    const synthesize = speech(16_000, [1, 2]);
    const store = new FileCrewPromptStore(dir, { synthesize } as never);

    await Promise.all([
      store.ensure("Принял.", "ryan"),
      store.ensure("Принял.", "ryan"),
    ]);
    await store.ensure("Принял.", "ryan");

    expect(synthesize).toHaveBeenCalledTimes(1);
  });

  it("reuses lines prepared before a restart", async () => {
    const name = crewPromptName("Принял.", "ryan");
    const synthesize = speech(16_000, [1, 2]);
    await mkdir(join(dir, "crew"), { recursive: true });
    await writeFile(join(dir, "crew", `${name}.sln16`), new Uint8Array([9]));

    await new FileCrewPromptStore(dir, { synthesize } as never).ensure(
      "Принял.",
      "ryan",
    );

    expect(synthesize).not.toHaveBeenCalled();
  });

  it("refuses a sample rate Asterisk cannot play", async () => {
    const store = new FileCrewPromptStore(dir, {
      synthesize: speech(22_050, [1, 2]),
    } as never);

    await expect(store.ensure("Принял.", "ryan")).rejects.toThrow("22050 Hz");
  });
});
