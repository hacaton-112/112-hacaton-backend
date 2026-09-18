import { createHash, createHmac } from "node:crypto";

import type { RecordingStorage } from "../ports/recording-storage.port";

import type { CallRecordingConfig } from "./call-recording.config";

const ALGORITHM = "AWS4-HMAC-SHA256";
const SERVICE = "s3";
const REQUEST_TIMEOUT_MS = 15_000;

/** SHA-256 пустого тела: у GET его нет, но подпись требует хеш. */
const EMPTY_PAYLOAD_HASH =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const sha256 = (data: string | Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");

const hmac = (key: Uint8Array | string, data: string): Buffer =>
  createHmac("sha256", key).update(data).digest();

/** Ключ объекта в пути подписывается закодированным, посегментно. */
const encodeKey = (key: string): string =>
  key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

/**
 * Отметка времени подписи: `20260909T014500Z`. Совместимые хранилища
 * отклоняют запрос, разошедшийся с их часами больше чем на четверть часа.
 */
const amzDate = (now: Date): string =>
  now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/**
 * Запись кладётся в S3-совместимое хранилище напрямую, без SDK.
 *
 * Подпись занимает полсотни строк, а SDK притащил бы в образ десятки мегабайт
 * ради одного PUT. Адресация путевая (`/bucket/key`), потому что MinIO по
 * умолчанию живёт именно так, а виртуальные хосты требуют своего DNS.
 */
export class S3RecordingStorage implements RecordingStorage {
  constructor(private readonly config: CallRecordingConfig) {}

  async put(
    key: string,
    body: Uint8Array<ArrayBuffer>,
    contentType: string,
  ): Promise<void> {
    const response = await this.send("PUT", key, {
      payload: body,
      contentType,
    });

    if (!response.ok) {
      throw new Error(
        `Recording storage rejected ${key}: HTTP ${response.status}`,
      );
    }
  }

  async get(
    key: string,
    signal?: AbortSignal,
  ): Promise<Uint8Array<ArrayBuffer> | null> {
    const response = await this.send("GET", key, undefined, signal);

    // Пропавшая запись — не поломка разбора: занятие могло идти с выключенным
    // хранилищем, и об этом честнее сказать пустотой, чем ошибкой.
    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `Recording storage refused ${key}: HTTP ${response.status}`,
      );
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  /** Одна подпись на оба запроса: различаются они телом и методом. */
  private send(
    method: "GET" | "PUT",
    key: string,
    body?: { payload: Uint8Array<ArrayBuffer>; contentType: string },
    signal?: AbortSignal,
  ): Promise<Response> {
    const endpoint = new URL(this.config.endpoint);
    const path = `/${this.config.bucket}/${encodeKey(key)}`;
    const timestamp = amzDate(new Date());
    const date = timestamp.slice(0, 8);
    const payloadHash =
      body === undefined ? EMPTY_PAYLOAD_HASH : sha256(body.payload);
    const headers: Record<string, string> = {
      host: endpoint.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": timestamp,
      ...(body === undefined ? {} : { "content-type": body.contentType }),
    };
    const signedHeaders = Object.keys(headers).sort();
    const canonicalRequest = [
      method,
      path,
      "",
      ...signedHeaders.map((name) => `${name}:${headers[name]}`),
      "",
      signedHeaders.join(";"),
      payloadHash,
    ].join("\n");
    const scope = `${date}/${this.config.region}/${SERVICE}/aws4_request`;
    const stringToSign = [
      ALGORITHM,
      timestamp,
      scope,
      sha256(canonicalRequest),
    ].join("\n");
    const signature = hmac(this.signingKey(date), stringToSign).toString("hex");

    return fetch(new URL(path, endpoint), {
      method,
      headers: {
        ...headers,
        authorization: `${ALGORITHM} Credential=${this.config.accessKeyId ?? ""}/${scope}, SignedHeaders=${signedHeaders.join(";")}, Signature=${signature}`,
      },
      // Blob, а не сам массив: типы fetch требуют буфер с известным видом,
      // а копия здесь не делается.
      ...(body === undefined
        ? {}
        : { body: new Blob([body.payload], { type: body.contentType }) }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
        : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  private signingKey(date: string): Buffer {
    return hmac(
      hmac(
        hmac(
          hmac(`AWS4${this.config.secretAccessKey ?? ""}`, date),
          this.config.region,
        ),
        SERVICE,
      ),
      "aws4_request",
    );
  }
}
