import { Channel } from "@tauri-apps/api/core";

import { API_CONFIG } from "../config/api";
import {
  CallServerEventSchema,
  type CallClientCommand,
  type CallServerEvent,
} from "../contracts/call";
import { ipc } from "../lib/ipc";

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
 * WebSocket, обработка PCM, буфер и воспроизведение остаются в Rust.
 * Webview управляет только жизненным циклом звонка.
 */
class NativeCallStream implements CallStream {
  private readonly callbacks: CallStreamCallbacks;
  private connection: string | null = null;
  private disposed = false;
  /** Не даёт новому нажатию обогнать остановку и отправку хвоста предыдущего. */
  private floorQueue: Promise<void> = Promise.resolve();

  constructor(callbacks: CallStreamCallbacks) {
    this.callbacks = callbacks;
  }

  async connect(token: string): Promise<void> {
    const events = new Channel<unknown>();
    events.onmessage = (payload) => this.handleEvent(payload);

    try {
      this.connection = await ipc.call.connect({
        url: API_CONFIG.getVoicePipelineStreamUrl(),
        token,
        onEvent: events,
      });
    } catch (reason) {
      throw this.toError(reason);
    }

    if (this.disposed) {
      await this.dispose();
    }
  }

  start(scenarioVersionId: string, scenarioCategory: string): Promise<void> {
    return ipc.call
      .start(this.requireConnection(), scenarioVersionId, scenarioCategory)
      .catch((reason: unknown) => {
        throw this.toError(reason);
      });
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

    this.callbacks.onEvent(parsed.data);
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
