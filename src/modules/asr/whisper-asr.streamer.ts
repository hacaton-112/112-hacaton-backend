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
      /** Пауза, по которой сервис сам заканчивает фразу. */
      endpointSilenceMs: z.number().nonnegative().optional(),
    })
    .loose(),
  z
    .object({
      type: z.literal("partial"),
      transcript: z.string(),
      audioMs: z.number().nonnegative(),
      processingMs: z.number().nonnegative(),
    })
    .loose(),
  z
    .object({
      type: z.literal("final"),
      transcript: z.string(),
      audioMs: z.number().nonnegative(),
      processingMs: z.number().nonnegative(),
      /**
       * Почему сервис закончил фразу. `catch` важнее, чем кажется: незнакомая
       * причина иначе завалила бы разбор объединения, финал ушёл бы в ветку
       * «неожиданное событие», и `finish()` провисел бы весь таймаут.
       */
      reason: z.enum(["silence", "stop"]).optional().catch(undefined),
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

/**
 * Одна реплика оператора, собранная из фраз.
 *
 * Сервис распознавания сам заканчивает фразу по паузе и продолжает слушать,
 * поэтому за одно нажатие кнопки приходит несколько финалов. Реплика оператора
 * от этого не делится: движку нужен вопрос целиком, а не его половина до
 * вдоха.
 */
class WhisperAsrStream implements AsrStreamHandle {
  private ready = false;
  private closed = false;
  private failure: Error | null = null;
  private final: ((transcript: AsrTranscript) => void) | null = null;
  private fail: ((error: Error) => void) | null = null;
  private readonly phrases: string[] = [];
  private audioMs = 0;
  private processingMs = 0;
  /** Терминальный финал получен: сервису больше нечего сказать. */
  private complete = false;
  /** Результат или отказ уже ушёл вызывающему. */
  private delivered = false;
  private finalTimer: ReturnType<typeof setTimeout> | null = null;
  private endpointSilenceMs: number | null = null;

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
    // Сервис уже сказал всё, что хотел: второй `stop` слать некому и незачем.
    if (this.complete) {
      this.deliver();

      return this.result();
    }

    // Поток мог сорваться, пока оператор ещё говорил. Если до обрыва он успел
    // сказать хоть фразу, она важнее ошибки: половина вопроса лучше, чем
    // потерянный ход.
    if (this.closed || this.failure !== null) {
      if (this.heard()) {
        this.logger.warn(
          `Returning ${this.phrases.length} recognised phrases of a broken stream ${this.sessionId}: ${
            this.failure?.message ?? "the stream is already closed"
          }`,
        );

        return this.result();
      }

      throw this.failure ?? new Error("The ASR stream is already closed");
    }

    return new Promise<AsrTranscript>((resolve, reject) => {
      this.finalTimer = setTimeout(() => {
        // Сервис замолчал. Услышанное до этого всё равно принадлежит оператору.
        if (this.heard()) {
          this.deliver();
          resolve(this.result());

          return;
        }

        this.abort();
        reject(new Error("ASR did not return a final transcript in time"));
      }, FINAL_TIMEOUT_MS);

      this.final = resolve;
      this.fail = reject;

      this.socket.send(JSON.stringify({ type: "stop" }));
    });
  }

  abort(): void {
    if (this.finalTimer !== null) {
      clearTimeout(this.finalTimer);
      this.finalTimer = null;
    }

    if (this.closed) {
      return;
    }

    this.closed = true;
    this.socket.close();
  }

  /**
   * Запоминает причину обрыва и будит того, кто уже ждёт финал.
   *
   * Если фразы уже собраны, обрыв стоит только той, что была в работе:
   * отдаём собранное, а не теряем реплику целиком.
   */
  private settle(error: Error): void {
    if (this.delivered) {
      return;
    }

    this.failure ??= error;

    if (this.fail === null) {
      return;
    }

    if (this.heard()) {
      const waiter = this.final;

      this.deliver();
      waiter?.(this.result());

      return;
    }

    const fail = this.fail;

    this.deliver();
    fail(error);
  }

  /** Прозвучало ли хоть что-то, что стоит отдать движку. */
  private heard(): boolean {
    return this.phrases.some((phrase) => phrase.length > 0);
  }

  /** Реплика целиком: фразы через пробел, длительности в сумме. */
  private result(): AsrTranscript {
    return {
      transcript: this.phrases.filter((phrase) => phrase.length > 0).join(" "),
      audioMs: this.audioMs,
      processingMs: this.processingMs,
    };
  }

  /** Закрывает ожидание: таймер, сокет и защита от повторной выдачи. */
  private deliver(): void {
    this.delivered = true;
    this.abort();
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

    if (event.type === "ready") {
      this.endpointSilenceMs = event.endpointSilenceMs ?? null;

      return;
    }

    if (event.type === "final") {
      // Копится всё, включая терминальный финал: его длительность — тоже часть
      // реплики, даже когда текст пустой.
      this.phrases.push(event.transcript.trim());
      this.audioMs += event.audioMs;
      this.processingMs += event.processingMs;

      // Пауза посреди фразы разговор не заканчивает: сервис слушает дальше, и
      // мы вместе с ним.
      if (event.reason === "silence") {
        return;
      }

      this.complete = true;

      if (this.phrases.length > 1) {
        this.logger.debug(
          `Stitched ${this.phrases.length} phrases for ${this.sessionId} at ${
            this.endpointSilenceMs ?? "unknown"
          } ms of silence`,
        );
      }

      const waiter = this.final;

      this.deliver();
      waiter?.(this.result());

      return;
    }

    if (event.type === "error") {
      this.settle(new Error(event.message));
    }

    // Партиалы намеренно игнорируются: оператор работает на слух, промежуточный
    // текст ему не показывается, а движку нужен только финал.
  }
}
