import { Inject, Injectable, Logger } from "@nestjs/common";

import { encodeWav, pcmDurationMs } from "../domain/wav";
import type {
  CallRecorder,
  RecordingSegment,
  RecordingTrack,
} from "../ports/call-recorder.port";
import {
  RECORDING_STORAGE,
  type RecordingStorage,
} from "../ports/recording-storage.port";

/**
 * Потолок на одну реплику — примерно четыре минуты на 16 кГц. Столько никто не
 * говорит без паузы; ограничение защищает память от клиента, который открыл
 * окно записи и забыл его закрыть.
 */
const MAX_SEGMENT_BYTES = 8 * 1_024 * 1_024;
const KEY_INDEX_WIDTH = 4;

interface SegmentManifestEntry {
  key: string;
  track: RecordingTrack;
  startMs: number;
  durationMs: number;
  sampleRate: number;
}

interface CallRecording {
  startedAt: Date;
  startedAtMs: number;
  nextIndex: number;
  /** Каждая загрузка сама решает, попадёт ли её кусок в манифест. */
  uploads: Promise<SegmentManifestEntry | null>[];
}

const NO_RECORDING: RecordingSegment = {
  write: () => undefined,
  close: () => undefined,
};

/**
 * Запись разговора: обе стороны, по кускам, в объектное хранилище.
 *
 * Куски отдельными объектами, а не одним файлом на звонок: реплика ограничена
 * по длине, поэтому в памяти всегда лежит немного, а обрыв загрузки стоит
 * одной реплики вместо всего разговора. Собрать их в одну дорожку можно
 * позже — смещения для этого лежат в манифесте.
 */
@Injectable()
export class CallRecordingService implements CallRecorder {
  private readonly logger = new Logger(CallRecordingService.name);
  private readonly calls = new Map<string, CallRecording>();

  constructor(
    @Inject(RECORDING_STORAGE)
    private readonly storage: RecordingStorage,
  ) {}

  startCall(sessionId: string): void {
    this.calls.set(sessionId, {
      startedAt: new Date(),
      startedAtMs: Date.now(),
      nextIndex: 1,
      uploads: [],
    });
  }

  openSegment(input: {
    sessionId: string;
    track: RecordingTrack;
    sampleRate: number;
  }): RecordingSegment {
    const call = this.calls.get(input.sessionId);

    if (call === undefined) {
      return NO_RECORDING;
    }

    const index = call.nextIndex;
    call.nextIndex += 1;

    const startMs = Date.now() - call.startedAtMs;
    const key = `calls/${input.sessionId}/${String(index).padStart(
      KEY_INDEX_WIDTH,
      "0",
    )}-${input.track}.wav`;
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    let closed = false;
    let truncated = false;

    return {
      write: (pcm) => {
        if (closed) {
          return;
        }

        if (byteLength + pcm.byteLength > MAX_SEGMENT_BYTES) {
          if (!truncated) {
            truncated = true;
            this.logger.warn(`Truncated an overlong recording segment ${key}`);
          }

          return;
        }

        chunks.push(pcm);
        byteLength += pcm.byteLength;
      },
      close: () => {
        if (closed) {
          return;
        }

        closed = true;

        // Оператор нажал и передумал: пустой кусок в записи только мешает.
        if (byteLength === 0) {
          return;
        }

        call.uploads.push(
          this.upload({
            key,
            track: input.track,
            startMs,
            durationMs: pcmDurationMs(byteLength, input.sampleRate),
            sampleRate: input.sampleRate,
            wav: encodeWav(concat(chunks, byteLength), input.sampleRate),
          }),
        );
      },
    };
  }

  finishCall(sessionId: string): void {
    const call = this.calls.get(sessionId);

    if (call === undefined) {
      return;
    }

    this.calls.delete(sessionId);

    if (call.uploads.length === 0) {
      return;
    }

    // Звонок уже закончился, ждать хвоста загрузок оператору незачем.
    void this.writeManifest(sessionId, call);
  }

  private async writeManifest(
    sessionId: string,
    call: CallRecording,
  ): Promise<void> {
    const settled = await Promise.all(call.uploads);
    // В манифест попадает только то, что действительно лежит в хранилище:
    // ссылка на пропавший кусок хуже, чем его отсутствие.
    const segments = settled
      .filter((segment): segment is SegmentManifestEntry => segment !== null)
      .sort((left, right) => left.startMs - right.startMs);

    if (segments.length === 0) {
      return;
    }

    const manifest = {
      sessionId,
      startedAt: call.startedAt.toISOString(),
      segments,
    };

    try {
      await this.storage.put(
        `calls/${sessionId}/manifest.json`,
        new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
        "application/json",
      );
    } catch (error) {
      this.logger.warn(
        `Could not store the recording manifest for ${sessionId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  private async upload(
    input: SegmentManifestEntry & { wav: Uint8Array<ArrayBuffer> },
  ): Promise<SegmentManifestEntry | null> {
    const { wav, ...entry } = input;

    try {
      await this.storage.put(entry.key, wav, "audio/wav");

      return entry;
    } catch (error) {
      this.logger.warn(
        `Could not store a recording segment ${entry.key}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );

      return null;
    }
  }
}

/** Запись не отзывается на выключенное хранилище ничем, включая ошибки. */
@Injectable()
export class NoopCallRecordingService implements CallRecorder {
  startCall(_sessionId: string): void {
    return undefined;
  }

  openSegment(_input: {
    sessionId: string;
    track: RecordingTrack;
    sampleRate: number;
  }): RecordingSegment {
    return NO_RECORDING;
  }

  finishCall(_sessionId: string): void {
    return undefined;
  }
}

const concat = (
  chunks: readonly Uint8Array[],
  byteLength: number,
): Uint8Array<ArrayBuffer> => {
  const pcm = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    pcm.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return pcm;
};
