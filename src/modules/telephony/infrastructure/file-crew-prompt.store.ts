import { mkdir, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Logger } from "@nestjs/common";

import { QWEN_TTS_VOICES, type SpeechSynthesisStreamEvent } from "@/contracts";

import {
  crewPromptMedia,
  crewPromptName,
  signedLinearExtension,
} from "../domain/crew-phrases";

/** Синтез, которым озвучиваются реплики: достаточно одного метода. */
export interface CrewPromptSynthesis {
  synthesize(
    input: unknown,
    signal: AbortSignal,
  ): AsyncIterable<SpeechSynthesisStreamEvent>;
}

const SYNTHESIS_TIMEOUT_MS = 60_000;

/**
 * Реплики нарядов в каталоге звуков Asterisk.
 *
 * Каждая реплика озвучивается один раз и лежит файлом: во время звонка АТС
 * только воспроизводит его, а синтез не стоит на пути разговора. Каталог
 * общий с Asterisk, поэтому звук не нужно передавать по сети на каждый звонок.
 */
export class FileCrewPromptStore {
  private readonly logger = new Logger(FileCrewPromptStore.name);
  private readonly prepared = new Set<string>();
  private readonly inFlight = new Map<string, Promise<string>>();
  private scanned?: Promise<void>;

  constructor(
    private readonly soundsDir: string,
    private readonly synthesis: CrewPromptSynthesis,
  ) {}

  private get directory(): string {
    return join(this.soundsDir, "crew");
  }

  /** Готовит реплику и возвращает, что попросить воспроизвести у АТС. */
  async ensure(text: string, voiceId: string): Promise<string> {
    await this.scan();
    const name = crewPromptName(text, voiceId);

    if (this.prepared.has(name)) return crewPromptMedia(name);

    const running = this.inFlight.get(name);
    if (running) return running;

    const preparing = this.synthesizeTo(name, text, voiceId).finally(() =>
      this.inFlight.delete(name),
    );
    this.inFlight.set(name, preparing);

    return preparing;
  }

  /** Озвучивает всё заранее; сбой одной реплики не мешает остальным. */
  async prepareAll(
    lines: readonly { text: string; voiceId: string }[],
  ): Promise<void> {
    for (const line of lines) {
      try {
        await this.ensure(line.text, line.voiceId);
      } catch (error) {
        this.logger.warn(
          `Could not prepare crew prompt "${line.text}": ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      }
    }
  }

  private scan(): Promise<void> {
    this.scanned ??= (async () => {
      await mkdir(this.directory, { recursive: true });
      for (const file of await readdir(this.directory)) {
        const dot = file.indexOf(".");
        if (dot > 0 && !file.endsWith(".partial")) {
          this.prepared.add(file.slice(0, dot));
        }
      }
    })();

    return this.scanned;
  }

  private async synthesizeTo(
    name: string,
    text: string,
    voiceId: string,
  ): Promise<string> {
    const voice =
      QWEN_TTS_VOICES.find((candidate) => candidate.id === voiceId) ??
      QWEN_TTS_VOICES[0];
    const parts: Uint8Array[] = [];
    let sampleRate = 0;
    let bytes = 0;

    for await (const event of this.synthesis.synthesize(
      {
        requestId: `crew-${name.slice(0, 16)}`,
        sessionId: "crew-prompts",
        text,
        language: "Russian",
        voiceId: voice.id,
        gender: voice.gender,
        emotion: "calm",
        intensity: 0.3,
        speechRate: 1,
      },
      AbortSignal.timeout(SYNTHESIS_TIMEOUT_MS),
    )) {
      if (event.type !== "audio.chunk") continue;
      sampleRate = event.chunk.sampleRate;
      bytes += event.chunk.audio.byteLength;
      parts.push(event.chunk.audio);
    }

    const extension = signedLinearExtension(sampleRate);
    if (bytes === 0 || extension === null) {
      throw new Error(
        `Synthesis returned ${bytes} bytes at ${sampleRate} Hz, which Asterisk cannot play`,
      );
    }

    const audio = new Uint8Array(bytes);
    let offset = 0;
    for (const part of parts) {
      audio.set(part, offset);
      offset += part.byteLength;
    }

    // Файл появляется целиком или не появляется вовсе: АТС не должна начать
    // играть недописанную реплику.
    const target = join(this.directory, `${name}.${extension}`);
    const partial = `${target}.partial`;
    await writeFile(partial, audio);
    await rename(partial, target);
    this.prepared.add(name);

    return crewPromptMedia(name);
  }
}
