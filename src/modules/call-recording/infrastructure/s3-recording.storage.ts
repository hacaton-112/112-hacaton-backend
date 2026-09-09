import { createHash, createHmac } from "node:crypto";

import type { RecordingStorage } from "../ports/recording-storage.port";

import type { CallRecordingConfig } from "./call-recording.config";

const ALGORITHM = "AWS4-HMAC-SHA256";
const SERVICE = "s3";
const REQUEST_TIMEOUT_MS = 15_000;

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
    const endpoint = new URL(this.config.endpoint);
    const path = `/${this.config.bucket}/${encodeKey(key)}`;
    const now = new Date();
    const timestamp = amzDate(now);
    const date = timestamp.slice(0, 8);
    const payloadHash = sha256(body);
    const headers: Record<string, string> = {
      "content-type": contentType,
      host: endpoint.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": timestamp,
    };
    const signedHeaders = Object.keys(headers).sort();
    const canonicalRequest = [
      "PUT",
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

    const response = await fetch(new URL(path, endpoint), {
      method: "PUT",
      headers: {
        ...headers,
        authorization: `${ALGORITHM} Credential=${this.config.accessKeyId ?? ""}/${scope}, SignedHeaders=${signedHeaders.join(";")}, Signature=${signature}`,
      },
      // Blob, а не сам массив: типы fetch требуют буфер с известным видом,
      // а копия здесь не делается.
      body: new Blob([body], { type: contentType }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(
        `Recording storage rejected ${key}: HTTP ${response.status}`,
      );
    }
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
