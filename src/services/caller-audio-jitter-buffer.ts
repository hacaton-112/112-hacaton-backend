const PCM16_BYTES_PER_SAMPLE = 2;

export const CALLER_AUDIO_STARTUP_BUFFER_MS = 160;
export const CALLER_AUDIO_RECOVERY_LEAD_MS = 20;

export interface ScheduledCallerAudio {
  stop(): void;
}

export interface CallerAudioScheduler {
  currentTime(): number;
  schedule(
    pcm: Int16Array,
    sampleRate: number,
    startAt: number,
  ): ScheduledCallerAudio;
}

interface CallerAudioJitterBufferOptions {
  scheduler: CallerAudioScheduler;
  startupBufferMs?: number;
  recoveryLeadMs?: number;
}

/**
 * Небольшой playout buffer для голоса заявителя.
 *
 * Первые чанки копятся до целевой длительности, после чего планируются одной
 * непрерывной дорожкой. Запас остаётся перед указателем воспроизведения и
 * поглощает обычный сетевой jitter; после длинного underrun поток продолжится
 * чуть впереди текущего времени, без наложения на уже поставленный звук.
 */
export class CallerAudioJitterBuffer {
  private readonly scheduler: CallerAudioScheduler;
  private readonly startupBufferMs: number;
  private readonly recoveryLeadSeconds: number;
  private readonly scheduled = new Set<ScheduledCallerAudio>();
  private buffered: ArrayBuffer[] = [];
  private bufferedMs = 0;
  private sampleRate = 0;
  private nextStartTime = 0;
  private accepting = false;
  private started = false;

  constructor(options: CallerAudioJitterBufferOptions) {
    this.scheduler = options.scheduler;
    this.startupBufferMs =
      options.startupBufferMs ?? CALLER_AUDIO_STARTUP_BUFFER_MS;
    this.recoveryLeadSeconds =
      (options.recoveryLeadMs ?? CALLER_AUDIO_RECOVERY_LEAD_MS) / 1_000;

    if (this.startupBufferMs <= 0 || this.recoveryLeadSeconds < 0) {
      throw new Error("Caller audio buffer timings must be positive");
    }
  }

  begin(sampleRate: number): void {
    if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
      throw new Error("Caller audio sample rate must be a positive integer");
    }

    this.reset();
    this.sampleRate = sampleRate;
    this.accepting = true;
  }

  push(chunk: ArrayBuffer): void {
    if (!this.accepting || chunk.byteLength === 0) {
      return;
    }

    if (chunk.byteLength % PCM16_BYTES_PER_SAMPLE !== 0) {
      throw new Error("Caller audio contains an incomplete PCM16 sample");
    }

    const ownedChunk = chunk.slice(0);

    if (this.started) {
      this.schedule(ownedChunk);
      return;
    }

    this.buffered.push(ownedChunk);
    this.bufferedMs += this.durationSeconds(ownedChunk) * 1_000;

    if (this.bufferedMs >= this.startupBufferMs) {
      this.flush();
    }
  }

  /** Короткая реплика не должна навсегда остаться меньше порога prebuffer. */
  finish(): void {
    if (!this.accepting) {
      return;
    }

    if (!this.started && this.buffered.length > 0) {
      this.flush();
    }
  }

  reset(): void {
    for (const source of this.scheduled) {
      try {
        source.stop();
      } catch {
        // Уже завершившийся AudioBufferSourceNode останавливать не требуется.
      }
    }

    this.scheduled.clear();
    this.buffered = [];
    this.bufferedMs = 0;
    this.sampleRate = 0;
    this.nextStartTime = 0;
    this.accepting = false;
    this.started = false;
  }

  private flush(): void {
    this.started = true;

    for (const chunk of this.buffered) {
      this.schedule(chunk);
    }

    this.buffered = [];
    this.bufferedMs = 0;
  }

  private schedule(chunk: ArrayBuffer): void {
    const now = this.scheduler.currentTime();
    const startAt = Math.max(
      this.nextStartTime,
      now + this.recoveryLeadSeconds,
    );
    const source = this.scheduler.schedule(
      new Int16Array(chunk),
      this.sampleRate,
      startAt,
    );

    this.scheduled.add(source);
    this.nextStartTime = startAt + this.durationSeconds(chunk);
  }

  private durationSeconds(chunk: ArrayBuffer): number {
    return chunk.byteLength / PCM16_BYTES_PER_SAMPLE / this.sampleRate;
  }
}
