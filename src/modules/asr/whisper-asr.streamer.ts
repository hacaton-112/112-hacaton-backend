import { Inject, Injectable, Logger } from "@nestjs/common";
import { z } from "zod";

import { env } from "@/core/config/env.config";

import {
  ASR_SOCKET_FACTORY,
  type AsrSocket,
  type AsrSocketFactory,
  type AsrStreamer,
  type AsrStreamHandle,
  type AsrTranscript,
} from "./asr-stream.port";
import { AsrService } from "./asr.service";

const CONNECT_TIMEOUT_MS = 5_000;
const FINAL_TIMEOUT_MS = 30_000;

const AsrServerEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("ready"),
      sessionId: z.string(),
      sampleRate: z.number(),
      model: z.string(),
    })
    .loose(),
  z
    .object({
      type: z.enum(["partial", "final"]),
      transcript: z.string(),
      audioMs: z.number().nonnegative(),
      processingMs: z.number().nonnegative(),
    })
    .loose(),
  z.object({ type: z.literal("pong") }).loose(),
  z.object({ type: z.literal("error"), message: z.string() }).loose(),
]);

/**
 * Адрес сокета строится из служебного `ASR_SERVICE_URL`, а не из `wsUrl`,
 * который сервис отдаёт в ответе: тот адрес предназначен клиентам и в боевом
 * развёртывании указывает наружу, тогда как backend ходит к сервису напрямую.
 */
export const buildAsrSocketUrl = (
  serviceUrl: string,
  sessionId: string,
): string => {
  const base = serviceUrl.replace(/\/$/, "");
  const scheme = base.startsWith("https://") ? "wss://" : "ws://";

  return `${scheme}${base.replace(/^https?:\/\//, "")}/v1/ws/${sessionId}`;
};

@Injectable()
export class WhisperAsrStreamer implements AsrStreamer {
  private readonly logger = new Logger(WhisperAsrStreamer.name);

  constructor(
    private readonly asr: AsrService,
    @Inject(ASR_SOCKET_FACTORY)
    private readonly createSocket: AsrSocketFactory,
  ) {}

  async open(language: string): Promise<AsrStreamHandle> {
    const session = await this.asr.createSession(language);
    const socket = this.createSocket(
      buildAsrSocketUrl(env.ASR_SERVICE_URL, session.sessionId),
    );

    return new WhisperAsrStream(
      session.sessionId,
      socket,
      this.logger,
    ).waitForReady();
  }
}

class WhisperAsrStream implements AsrStreamHandle {
  private ready = false;
  private closed = false;
  private failure: Error | null = null;
  private final: ((transcript: AsrTranscript) => void) | null = null;
  private fail: ((error: Error) => void) | null = null;

  constructor(
    readonly sessionId: string,
    private readonly socket: AsrSocket,
    private readonly logger: Logger,
  ) {}

  async waitForReady(): Promise<this> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.abort();
        reject(new Error("ASR did not become ready in time"));
      }, CONNECT_TIMEOUT_MS);

      this.socket.on("open", () => {
        clearTimeout(timer);
        this.ready = true;
        resolve();
      });

      this.socket.on("error", (error) => {
        clearTimeout(timer);
        this.closed = true;
        this.settle(error);
        reject(error);
      });

      this.socket.on("close", () => {
        this.closed = true;
        // Обрыв до финала — это потерянная реплика, а не пустая: пусть
        // вызывающий узнает об этом ошибкой, а не тишиной.
        this.settle(new Error("ASR closed the stream before the final result"));
      });

      this.socket.on("message", (data) => {
        this.handleMessage(data);
      });
    });

    return this;
  }

  send(chunk: Uint8Array): void {
    if (!this.ready || this.closed) {
      return;
    }

    this.socket.send(chunk);
  }

  async finish(): Promise<AsrTranscript> {
    // Поток мог сорваться, пока оператор ещё говорил: тогда отвечаем той же
    // ошибкой сразу, а не ждём финала, который уже некому прислать.
    if (this.failure) {
      throw this.failure;
    }

    if (this.closed) {
      throw new Error("The ASR stream is already closed");
    }

    return new Promise<AsrTranscript>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.abort();
        reject(new Error("ASR did not return a final transcript in time"));
      }, FINAL_TIMEOUT_MS);

      this.final = (transcript) => {
        clearTimeout(timer);
        this.abort();
        resolve(transcript);
      };
      this.fail = (error) => {
        clearTimeout(timer);
        reject(error);
      };

      this.socket.send(JSON.stringify({ type: "stop" }));
    });
  }

  abort(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.socket.close();
  }

  /** Запоминает причину обрыва и будит того, кто уже ждёт финал. */
  private settle(error: Error): void {
    this.failure ??= error;
    this.fail?.(error);
  }

  private handleMessage(data: unknown): void {
    const parsed = AsrServerEventSchema.safeParse(
      JSON.parse(String(data)) as unknown,
    );

    if (!parsed.success) {
      this.logger.warn(`Ignored an unexpected ASR event for ${this.sessionId}`);

      return;
    }

    const event = parsed.data;

    if (event.type === "final") {
      this.final?.({
        transcript: event.transcript,
        audioMs: event.audioMs,
        processingMs: event.processingMs,
      });

      return;
    }

    if (event.type === "error") {
      this.settle(new Error(event.message));
    }

    // Партиалы намеренно игнорируются: оператор работает на слух, промежуточный
    // текст ему не показывается, а движку нужен только финал.
  }
}
