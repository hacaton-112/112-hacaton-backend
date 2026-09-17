import { createHash, createHmac } from "node:crypto";
import { Logger } from "@nestjs/common";

import type { MapConfig } from "../map.config";
import type { MapTileStorage } from "../ports/map-tile-storage.port";

const ALGORITHM = "AWS4-HMAC-SHA256";
const SERVICE = "s3";
const REQUEST_TIMEOUT_MS = 10_000;

const EMPTY_PAYLOAD_HASH =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const sha256 = (data: string | Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");

const hmac = (key: Uint8Array | string, data: string): Buffer =>
  createHmac("sha256", key).update(data).digest();

const encodeKey = (key: string): string =>
  key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const amzDate = (now: Date): string =>
  now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

export class S3MapTileStorage implements MapTileStorage {
  private readonly logger = new Logger(S3MapTileStorage.name);

  constructor(private readonly config: MapConfig) {}

  async getTile(z: number, x: number, y: number): Promise<Uint8Array | null> {
    const key = `${z}/${x}/${y}.png`;
    try {
      const response = await this.send("GET", key);
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        this.logger.warn(`MinIO responded with HTTP ${response.status} for tile ${key}`);
        return null;
      }
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      this.logger.debug(
        `Failed to fetch tile ${key} from S3/MinIO: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async putTile(
    z: number,
    x: number,
    y: number,
    data: Uint8Array,
    contentType = "image/png",
  ): Promise<void> {
    const key = `${z}/${x}/${y}.png`;
    const response = await this.send("PUT", key, {
      payload: data,
      contentType,
    });

    if (!response.ok) {
      throw new Error(
        `Map tile storage rejected tile ${key}: HTTP ${response.status}`,
      );
    }
  }

  private send(
    method: "GET" | "PUT",
    key: string,
    body?: { payload: Uint8Array; contentType: string },
  ): Promise<Response> {
    const endpoint = new URL(this.config.s3Endpoint);
    const path = `/${this.config.s3Bucket}/${encodeKey(key)}`;
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
    const scope = `${date}/${this.config.s3Region}/${SERVICE}/aws4_request`;
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
        authorization: `${ALGORITHM} Credential=${this.config.s3AccessKeyId ?? ""}/${scope}, SignedHeaders=${signedHeaders.join(";")}, Signature=${signature}`,
      },
      ...(body === undefined
        ? {}
        : { body: new Blob([body.payload as unknown as BlobPart], { type: body.contentType }) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  private signingKey(date: string): Buffer {
    return hmac(
      hmac(
        hmac(
          hmac(`AWS4${this.config.s3SecretAccessKey ?? ""}`, date),
          this.config.s3Region,
        ),
        SERVICE,
      ),
      "aws4_request",
    );
  }
}
