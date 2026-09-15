import { ApiError } from "./api";

/**
 * Текст ошибки для показа оператору.
 *
 * `ApiError` уже несёт разобранное сообщение backend, обычный `Error` — своё;
 * всё остальное (отменённый промис, строка из IPC) заменяется запасным
 * текстом, который зависит от места вызова.
 */
export const messageFrom = (error: unknown, fallback: string): string =>
  error instanceof ApiError || error instanceof Error
    ? error.message
    : fallback;
