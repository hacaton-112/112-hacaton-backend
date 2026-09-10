/**
 * Куда ложится запись разговора.
 *
 * Порт, а не прямой вызов хранилища: приёмка занятия читает записи месяцами,
 * и хранилище за это время может смениться, а звонок об этом знать не должен.
 */
export interface RecordingStorage {
  /**
   * Читает объект обратно; `null`, если его нет.
   *
   * Нужен разбору занятия: запись отдаётся клиенту через backend, чтобы
   * корзина оставалась закрытой, а клиенту не понадобились ключи от неё.
   */
  get(key: string): Promise<Uint8Array<ArrayBuffer> | null>;

  /** Тело — собственный буфер вызывающего: разделяемая память сюда не идёт. */
  put(
    key: string,
    body: Uint8Array<ArrayBuffer>,
    contentType: string,
  ): Promise<void>;
}

export const RECORDING_STORAGE = Symbol("RECORDING_STORAGE");
