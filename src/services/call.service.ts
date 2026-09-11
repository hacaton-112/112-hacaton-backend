import { Channel } from "@tauri-apps/api/core";

import { API_CONFIG } from "../config/api";
import {
  CallServerEventSchema,
  type CallClientCommand,
  type CallServerEvent,
} from "../contracts/call";
import { ipc } from "../lib/ipc";
import {
  TelephoneAudioProcessor,
  resolveScenarioAmbience,
} from "./telephone-audio-processor";

interface CallStreamCallbacks {
  onEvent: (event: CallServerEvent) => void;
  onUnknownEvent?: (payload: unknown) => void;
}

export interface CallStream {
  connect(token: string): Promise<void>;
  start(scenarioVersionId: string, scenarioCategory: string): Promise<void>;
  accept(): Promise<void>;
  decline(): Promise<void>;
  end(): Promise<void>;
  holdFloor(): Promise<void>;
  releaseFloor(): Promise<void>;
  dispose(): Promise<void>;
}

/**
 * WebSocket и PCM остаются в Rust. Webview управляет жизненным циклом звонка
 * и проигрывает голос заявителя, полученный по бинарному Tauri Channel.
 */
class NativeCallStream implements CallStream {
  private readonly callbacks: CallStreamCallbacks;
  private readonly callerAudio: CallerAudioJitterBuffer;
  private audioContext?: AudioContext;
  private sampleRate = 24_000;
  private scenarioCategory = "other";
  private scenarioVersionId = "unselected";
  private audioProcessor?: TelephoneAudioProcessor;
  private connection: string | null = null;
  private disposed = false;
  /** Не даёт новому нажатию обогнать остановку и отправку хвоста предыдущего. */
  private floorQueue: Promise<void> = Promise.resolve();

  constructor(callbacks: CallStreamCallbacks) {
    this.callbacks = callbacks;
    this.callerAudio = new CallerAudioJitterBuffer({
      scheduler: {
        currentTime: () => this.ensureAudioContext().currentTime,
        schedule: (pcm, sampleRate, startAt) =>
          this.schedulePcmChunk(pcm, sampleRate, startAt),
      },
    });
  }

  async connect(token: string): Promise<void> {
    const events = new Channel<unknown>();
    events.onmessage = (payload) => this.handleEvent(payload);

    const audio = new Channel<ArrayBuffer>();
    audio.onmessage = (chunk) => this.callerAudio.push(chunk);

    try {
      this.connection = await ipc.call.connect({
        url: API_CONFIG.getVoicePipelineStreamUrl(),
        token,
        onEvent: events,
        onAudio: audio,
      });
    } catch (reason) {
      throw this.toError(reason);
    }

    if (this.disposed) {
      await this.dispose();
    }
  }

  start(scenarioVersionId: string, scenarioCategory: string): Promise<void> {
    this.resetAudioProcessing();
    this.scenarioVersionId = scenarioVersionId;
    this.scenarioCategory = scenarioCategory;

    return this.send({ type: "start", scenarioVersionId });
  }

  accept(): Promise<void> {
    return this.send({ type: "accept" });
  }

  decline(): Promise<void> {
    return this.send({ type: "decline" });
  }

  end(): Promise<void> {
    return this.send({ type: "end" });
  }

  holdFloor(): Promise<void> {
    return this.queueFloor(async () => {
      const connection = this.requireConnection();
      const microphone = new Channel<unknown>();
      microphone.onmessage = () => undefined;

      try {
        await ipc.call.attachMicrophoneChannel(connection, microphone.id);
        await ipc.call.startListening(connection);
        await ipc.systemAudio.start(microphone, {
          loopback: false,
          processing: false,
          levelOnly: false,
        });
      } catch (reason) {
        await ipc.systemAudio.stop().catch(() => undefined);
        await ipc.call.stopListening(connection).catch(() => undefined);
        throw this.toError(reason);
      }
    });
  }

  releaseFloor(): Promise<void> {
    return this.queueFloor(async () => {
      const connection = this.connection;
      if (connection === null) return;

      await ipc.systemAudio.stop().catch(() => undefined);
      await ipc.call.stopListening(connection).catch(() => undefined);
    });
  }

  async dispose(): Promise<void> {
    this.disposed = true;

    await this.queueFloor(async () => {
      const connection = this.connection;
      this.connection = null;

      await ipc.systemAudio.stop().catch(() => undefined);

      if (connection !== null) {
        await ipc.call.stopListening(connection).catch(() => undefined);
        await ipc.call.disconnect(connection).catch(() => undefined);
      }
    }).catch(() => undefined);

    this.callerAudio.reset();
    await this.audioContext?.close().catch(() => undefined);
    this.audioContext = undefined;
    this.resetAudioProcessing();
  }

  private async send(command: CallClientCommand): Promise<void> {
    await ipc.call
      .send(this.requireConnection(), command)
      .catch((reason: unknown) => {
        throw this.toError(reason);
      });
  }

  private requireConnection(): string {
    if (this.connection === null) {
      throw new Error("Соединение со звонком не открыто");
    }

    return this.connection;
  }

  private queueFloor(operation: () => Promise<void>): Promise<void> {
    const pending = this.floorQueue.catch(() => undefined).then(operation);
    this.floorQueue = pending.catch(() => undefined);
    return pending;
  }

  private handleEvent(payload: unknown): void {
    if (this.disposed) return;

    const parsed = CallServerEventSchema.safeParse(payload);

    if (!parsed.success) {
      this.callbacks.onUnknownEvent?.(payload);
      return;
    }

    if (parsed.data.type === "audio.start") {
      this.sampleRate = parsed.data.sampleRate;
      this.nextStartTime = this.ensureAudioContext().currentTime;
      this.audioProcessor?.reset();
      this.audioProcessor = new TelephoneAudioProcessor({
        sampleRate: this.sampleRate,
        ambience: resolveScenarioAmbience(this.scenarioCategory),
        seed: `${this.scenarioVersionId}:${parsed.data.streamId}`,
      });
    } else if (
      parsed.data.type === "request.cancelled" ||
      parsed.data.type === "call.ended" ||
      parsed.data.type === "socket.closed" ||
      parsed.data.type === "socket.error"
    ) {
      this.resetAudioProcessing();
    }

    this.callbacks.onEvent(parsed.data);
  }

  private ensureAudioContext(): AudioContext {
    this.audioContext ??= new AudioContext({ sampleRate: this.sampleRate });
    return this.audioContext;
  }

  private schedulePcmChunk(
    pcm16: Int16Array,
    sampleRate: number,
    startAt: number,
  ): ScheduledCallerAudio {
    const context = this.ensureAudioContext();
    const audioBuffer = context.createBuffer(1, pcm16.length, sampleRate);
    const channel = audioBuffer.getChannelData(0);
    const processed = this.ensureAudioProcessor().process(pcm16);
    channel.set(processed);

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);
    source.start(startAt);

    return {
      stop: () => source.stop(),
    };
  }

  private ensureAudioProcessor(): TelephoneAudioProcessor {
    this.audioProcessor ??= new TelephoneAudioProcessor({
      sampleRate: this.sampleRate,
      ambience: resolveScenarioAmbience(this.scenarioCategory),
      seed: this.scenarioVersionId,
    });

    return this.audioProcessor;
  }

  private resetAudioProcessing(): void {
    this.audioProcessor?.reset();
    this.audioProcessor = undefined;
    this.nextStartTime = 0;
  }

  private toError = (reason: unknown): Error =>
    reason instanceof Error
      ? reason
      : new Error(typeof reason === "string" ? reason : String(reason));
}

export const callService = {
  createStream(callbacks: CallStreamCallbacks): CallStream {
    return new NativeCallStream(callbacks);
  },
};
