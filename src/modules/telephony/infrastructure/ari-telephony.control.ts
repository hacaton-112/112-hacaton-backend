import { Logger } from "@nestjs/common";
import WebSocket from "ws";

import type {
  TelephonyControlPort,
  TelephonyEvent,
} from "../ports/telephony-control.port";
import type { TelephonyConfig } from "./telephony.config";

/**
 * Пороги определения речи Asterisk: сколько миллисекунд тишины завершают
 * фразу и с какой энергии звук считается голосом. Тишина короче секунды —
 * это пауза внутри фразы, а не её конец.
 */
const TALK_DETECT = "1000,128";
const MAX_RECONNECT_DELAY_MS = 10_000;
const REQUEST_TIMEOUT_MS = 5_000;

interface AriEvent {
  readonly type: string;
  readonly args?: readonly string[];
  readonly duration?: number;
  readonly channel?: {
    readonly id: string;
    readonly caller?: { readonly number?: string };
    readonly dialplan?: { readonly exten?: string };
  };
  readonly playback?: { readonly id: string; readonly target_uri?: string };
}

/**
 * Приложение Stasis поверх Asterisk REST Interface.
 *
 * Команды идут по HTTP, события — по WebSocket. Соединение восстанавливается
 * само: АТС может перезапуститься во время занятия, и звонки после этого
 * должны снова доходить до нарядов без перезапуска backend.
 */
export class AriTelephonyControl implements TelephonyControlPort {
  private readonly logger = new Logger(AriTelephonyControl.name);
  private readonly listeners = new Set<(event: TelephonyEvent) => void>();
  private socket?: WebSocket;
  private reconnectDelayMs = 500;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private stopped = false;

  constructor(
    private readonly config: TelephonyConfig["ari"],
    private readonly fetchImplementation: typeof fetch = fetch,
    private readonly createSocket: (url: string) => WebSocket = (url) =>
      new WebSocket(url),
  ) {}

  connect(): void {
    this.stopped = false;
    this.open();
  }

  close(): void {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }

  subscribe(listener: (event: TelephonyEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async answer(channelId: string): Promise<void> {
    await this.request(
      "POST",
      `/channels/${encodeURIComponent(channelId)}/answer`,
    );
  }

  async detectSpeech(channelId: string): Promise<void> {
    const query = new URLSearchParams({
      variable: "TALK_DETECT(set)",
      value: TALK_DETECT,
    });
    await this.request(
      "POST",
      `/channels/${encodeURIComponent(channelId)}/variable?${query}`,
    );
  }

  async play(channelId: string, media: string): Promise<string> {
    const query = new URLSearchParams({ media });
    const response = await this.request(
      "POST",
      `/channels/${encodeURIComponent(channelId)}/play?${query}`,
    );
    const body = (await response.json()) as { id?: unknown };

    if (typeof body.id !== "string") {
      throw new Error("Asterisk did not return a playback id");
    }

    return body.id;
  }

  async hangUp(channelId: string): Promise<void> {
    await this.request(
      "DELETE",
      `/channels/${encodeURIComponent(channelId)}`,
      // Канал, который уже положил трубку, — не ошибка отбоя.
      [404],
    );
  }

  private async request(
    method: "POST" | "DELETE",
    path: string,
    tolerated: readonly number[] = [],
  ): Promise<Response> {
    const response = await this.fetchImplementation(
      `${this.config.url}/ari${path}`,
      {
        method,
        headers: { Authorization: this.authorization() },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (!response.ok && !tolerated.includes(response.status)) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      throw new Error(
        `Asterisk ARI ${method} ${path} → ${response.status} ${detail}`,
      );
    }

    return response;
  }

  private authorization(): string {
    return `Basic ${Buffer.from(`${this.config.user}:${this.config.password}`).toString("base64")}`;
  }

  private open(): void {
    const url = new URL(this.config.url.replace(/^http/u, "ws"));
    url.pathname = "/ari/events";
    url.searchParams.set("app", this.config.app);
    url.searchParams.set(
      "api_key",
      `${this.config.user}:${this.config.password}`,
    );

    const socket = this.createSocket(url.toString());
    this.socket = socket;

    socket.on("open", () => {
      this.reconnectDelayMs = 500;
      this.logger.log(
        `Connected to Asterisk ARI as application ${this.config.app}`,
      );
    });
    socket.on("message", (raw) => this.dispatch(raw.toString()));
    socket.on("error", (error) => {
      this.logger.warn(`Asterisk ARI connection error: ${error.message}`);
    });
    socket.on("close", () => {
      if (this.stopped) return;
      this.reconnectTimer = setTimeout(
        () => this.open(),
        this.reconnectDelayMs,
      );
      this.reconnectTimer.unref?.();
      this.reconnectDelayMs = Math.min(
        this.reconnectDelayMs * 2,
        MAX_RECONNECT_DELAY_MS,
      );
    });
  }

  private dispatch(raw: string): void {
    let event: AriEvent;
    try {
      event = JSON.parse(raw) as AriEvent;
    } catch {
      return;
    }

    const translated = translateAriEvent(event);
    if (!translated) return;

    for (const listener of this.listeners) {
      try {
        listener(translated);
      } catch (error) {
        this.logger.error(
          `Telephony listener failed on ${translated.type}: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      }
    }
  }
}

/** Переводит событие ARI на язык порта; прочие события не нужны. */
export function translateAriEvent(event: AriEvent): TelephonyEvent | null {
  const channelId = event.channel?.id;

  switch (event.type) {
    case "StasisStart":
      return channelId
        ? {
            type: "call-started",
            channelId,
            callerNumber: event.channel?.caller?.number ?? "",
            dialedNumber:
              event.args?.[0] ?? event.channel?.dialplan?.exten ?? "",
          }
        : null;
    case "StasisEnd":
      return channelId ? { type: "call-ended", channelId } : null;
    case "ChannelTalkingStarted":
      return channelId ? { type: "speech-started", channelId } : null;
    case "ChannelTalkingFinished":
      return channelId
        ? {
            type: "speech-finished",
            channelId,
            durationMs: event.duration ?? 0,
          }
        : null;
    case "PlaybackFinished": {
      const target = event.playback?.target_uri ?? "";
      return event.playback && target.startsWith("channel:")
        ? {
            type: "playback-finished",
            channelId: target.slice("channel:".length),
            playbackId: event.playback.id,
          }
        : null;
    }
    default:
      return null;
  }
}
