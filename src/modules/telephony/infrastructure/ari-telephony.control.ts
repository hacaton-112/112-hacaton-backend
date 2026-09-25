import { randomUUID } from "node:crypto";
import { createSocket as createDatagramSocket, type Socket } from "node:dgram";

import { Logger } from "@nestjs/common";
import WebSocket from "ws";

import type {
  TelephonyAudioTap,
  TelephonyControlPort,
  TelephonyEvent,
} from "../ports/telephony-control.port";
import { decodeRtpMulaw, isNewerRtpSequence } from "./rtp-mulaw";
import type { TelephonyConfig } from "./telephony.config";
import {
  isCrewCallPurpose,
  isCrewProgressReportStatus,
} from "../domain/crew-call";

const MAX_RECONNECT_DELAY_MS = 10_000;
const REQUEST_TIMEOUT_MS = 5_000;
export const MEDIA_TAP_APP_ARG = "crew-asr-media";

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
  private readonly audioTaps = new Set<TelephonyAudioTap>();

  constructor(
    private readonly config: TelephonyConfig["ari"],
    private readonly fetchImplementation: typeof fetch = fetch,
    private readonly createSocket: (url: string) => WebSocket = (url) =>
      new WebSocket(url),
  ) {}

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
    for (const tap of this.audioTaps) void tap.stop();
    this.audioTaps.clear();
  }

  subscribe(listener: (event: TelephonyEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async originate(input: {
    readonly endpoint: string;
    readonly appArgs: readonly string[];
    readonly callerId: string;
    readonly channelId: string;
    readonly timeoutSeconds: number;
  }): Promise<void> {
    const query = new URLSearchParams({
      endpoint: input.endpoint,
      app: this.config.app,
      appArgs: input.appArgs.join(","),
      callerId: input.callerId,
      channelId: input.channelId,
      timeout: String(input.timeoutSeconds),
    });
    // Повтор одной команды использует тот же channelId. Для ARI конфликт
    // означает, что этот канал уже создаётся или существует — это успех
    // идемпотентного click-to-call, а не повод звонить ещё раз.
    await this.request("POST", `/channels?${query}`, [409]);
  }

  async answer(channelId: string): Promise<void> {
    await this.request(
      "POST",
      `/channels/${encodeURIComponent(channelId)}/answer`,
    );
  }

  async captureInboundAudio(
    channelId: string,
    onAudio: (chunk: Uint8Array) => void,
  ): Promise<TelephonyAudioTap> {
    const socket = createDatagramSocket("udp4");
    const port = await this.bindMediaSocket(socket);
    const suffix = randomUUID();
    const bridgeId = `crew-asr-bridge-${suffix}`;
    const snoopId = `crew-asr-snoop-${suffix}`;
    const mediaId = `crew-asr-media-${suffix}`;
    let previousSequence: number | null = null;

    socket.on("error", (error) => {
      this.logger.warn(
        `Asterisk media socket for ${channelId} failed: ${error.message}`,
      );
    });
    socket.on("message", (packet) => {
      const decoded = decodeRtpMulaw(packet);
      if (
        decoded === null ||
        (previousSequence !== null &&
          !isNewerRtpSequence(decoded.sequence, previousSequence))
      ) {
        return;
      }
      previousSequence = decoded.sequence;
      onAudio(decoded.pcm16);
    });

    const cleanupAsterisk = async () => {
      await Promise.all([
        this.request(
          "DELETE",
          `/channels/${encodeURIComponent(mediaId)}`,
          [404],
        ).catch(() => undefined),
        this.request(
          "DELETE",
          `/channels/${encodeURIComponent(snoopId)}`,
          [404],
        ).catch(() => undefined),
      ]);
      await this.request(
        "DELETE",
        `/bridges/${encodeURIComponent(bridgeId)}`,
        [404],
      ).catch(() => undefined);
    };

    try {
      const bridgeQuery = new URLSearchParams({
        type: "mixing,proxy_media",
        name: bridgeId,
      });
      await this.request(
        "POST",
        `/bridges/${encodeURIComponent(bridgeId)}?${bridgeQuery}`,
      );

      const snoopQuery = new URLSearchParams({
        app: this.config.app,
        appArgs: `${MEDIA_TAP_APP_ARG},${channelId}`,
        spy: "in",
        whisper: "none",
      });
      await this.request(
        "POST",
        `/channels/${encodeURIComponent(channelId)}/snoop/${encodeURIComponent(snoopId)}?${snoopQuery}`,
      );

      const mediaQuery = new URLSearchParams({
        app: this.config.app,
        appArgs: `${MEDIA_TAP_APP_ARG},${channelId}`,
        external_host: `${this.config.mediaHost}:${port}`,
        format: "ulaw",
        transport: "udp",
        encapsulation: "rtp",
        connection_type: "client",
        direction: "both",
        channelId: mediaId,
      });
      await this.request("POST", `/channels/externalMedia?${mediaQuery}`);

      const channelQuery = new URLSearchParams({
        channel: `${snoopId},${mediaId}`,
      });
      await this.request(
        "POST",
        `/bridges/${encodeURIComponent(bridgeId)}/addChannel?${channelQuery}`,
      );
    } catch (error) {
      socket.close();
      await cleanupAsterisk();
      throw error;
    }

    let stopped = false;
    const tap: TelephonyAudioTap = {
      stop: async () => {
        if (stopped) return;
        stopped = true;
        this.audioTaps.delete(tap);
        socket.close();
        await cleanupAsterisk();
      },
    };
    this.audioTaps.add(tap);
    return tap;
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

  private bindMediaSocket(socket: Socket): Promise<number> {
    return new Promise((resolve, reject) => {
      const failed = (error: Error) => reject(error);
      socket.once("error", failed);
      socket.bind(0, this.config.mediaBindHost, () => {
        socket.off("error", failed);
        const address = socket.address();
        if (typeof address === "string") {
          socket.close();
          reject(new Error("Asterisk media socket did not bind to UDP"));
          return;
        }
        resolve(address.port);
      });
    });
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
      if (event.args?.[0] === MEDIA_TAP_APP_ARG) return null;
      return channelId
        ? {
            type: "call-started",
            channelId,
            callerNumber: event.channel?.caller?.number ?? "",
            dialedNumber:
              event.args?.[0] ?? event.channel?.dialplan?.exten ?? "",
            ...(event.args?.[1] ? { exerciseId: event.args[1] } : {}),
            ...(event.args?.[2] ? { requestEventId: event.args[2] } : {}),
            ...(event.args?.[3] && isCrewCallPurpose(event.args[3])
              ? { callPurpose: event.args[3] }
              : {}),
            ...(event.args?.[4] && isCrewProgressReportStatus(event.args[4])
              ? { reportedStatus: event.args[4] }
              : {}),
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
