export interface AsrTranscript {
  readonly transcript: string;
  readonly audioMs: number;
  readonly processingMs: number;
}

/**
 * Открытый поток распознавания речи оператора в течение звонка.
 *
 * Сессия живёт от первого кадра до финала по `stop`. По дороге сервис сам
 * заканчивает реплики по паузе, а длинную непрерывную речь может нарезать на
 * технические сегменты — адаптер объединяет их до ближайшего VAD-финала.
 */
export interface AsrStreamHandle {
  readonly sessionId: string;

  /** Кадр PCM16 16 кГц моно. Не блокирует: звук не должен ждать сеть. */
  send(chunk: Uint8Array): void;

  /**
   * Подписывает постоянный поток на законченные Silero VAD фразы.
   * Получение фразы не закрывает ASR-сессию: следующие PCM-кадры продолжают
   * формировать следующую реплику оператора.
   */
  onTranscript(listener: (transcript: AsrTranscript) => void): void;

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
