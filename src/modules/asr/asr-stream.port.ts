export interface AsrTranscript {
  readonly transcript: string;
  readonly audioMs: number;
  readonly processingMs: number;
}

/**
 * Открытый поток распознавания одной реплики оператора.
 *
 * Сессия сервиса одноразовая: она живёт от первого кадра до финала по `stop`,
 * поэтому дескриптор нельзя переиспользовать между репликами. По дороге сервис
 * сам заканчивает фразы по паузе и присылает их отдельными финалами — реплика
 * от этого не делится, её собирает адаптер.
 */
export interface AsrStreamHandle {
  readonly sessionId: string;

  /** Кадр PCM16 16 кГц моно. Не блокирует: звук не должен ждать сеть. */
  send(chunk: Uint8Array): void;

  /**
   * Просит финальную расшифровку и закрывает поток.
   *
   * Возвращает реплику целиком, сшитую из фраз, которые сервис разделил
   * паузами; длительности в ней — суммы по всем фразам.
   */
  finish(): Promise<AsrTranscript>;

  /** Обрывает поток без финала — например, когда клиент отключился. */
  abort(): void;
}

export interface AsrStreamer {
  open(language: string): Promise<AsrStreamHandle>;
}

export const ASR_STREAMER = Symbol("ASR_STREAMER");

/**
 * Минимум от WebSocket-клиента, который нужен потоку. Вынесен, чтобы спека
 * проверяла протокол без поднятия сервиса распознавания.
 */
export interface AsrSocket {
  send(data: Uint8Array | string): void;
  close(): void;
  on(event: "open", listener: () => void): void;
  on(event: "message", listener: (data: unknown) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "close", listener: () => void): void;
}

export type AsrSocketFactory = (url: string) => AsrSocket;

export const ASR_SOCKET_FACTORY = Symbol("ASR_SOCKET_FACTORY");
