import { createHash } from "node:crypto";

import type { CallRecordingConfig } from "./call-recording.config";
import { S3RecordingStorage } from "./s3-recording.storage";

const config: CallRecordingConfig = {
  enabled: true,
  endpoint: "http://127.0.0.1:9000",
  region: "us-east-1",
  bucket: "call-recordings",
  accessKeyId: "minio-user",
  secretAccessKey: "minio-password",
};

interface SentRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
}

const captureFetch = (
  status = 200,
): { calls: SentRequest[]; fetchMock: jest.Mock } => {
  const calls: SentRequest[] = [];
  const fetchMock = jest.fn(async (url: URL, init: RequestInit) => {
    calls.push({
      url: url.toString(),
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
    });

    return {
      ok: status < 400,
      status,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response;
  });

  global.fetch = fetchMock as unknown as typeof fetch;

  return { calls, fetchMock };
};

const body = (bytes: number[]): Uint8Array<ArrayBuffer> =>
  new Uint8Array(bytes);

describe(S3RecordingStorage.name, () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("addresses the bucket by path, the way MinIO is deployed", async () => {
    const { calls } = captureFetch();

    await new S3RecordingStorage(config).put(
      "calls/session-1/0001-operator.wav",
      body([1, 2, 3, 4]),
      "audio/wav",
    );

    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.url).toBe(
      "http://127.0.0.1:9000/call-recordings/calls/session-1/0001-operator.wav",
    );
  });

  it("signs the request the way a compatible store expects", async () => {
    const { calls } = captureFetch();
    const payload = body([1, 2, 3, 4]);

    await new S3RecordingStorage(config).put(
      "calls/a.wav",
      payload,
      "audio/wav",
    );

    const headers = calls[0]?.headers ?? {};
    expect(headers["x-amz-content-sha256"]).toBe(
      createHash("sha256").update(payload).digest("hex"),
    );
    expect(headers["x-amz-date"]).toMatch(/^\d{8}T\d{6}Z$/);
    expect(headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=minio-user\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
  });

  it("signs the audio itself, not just the address", async () => {
    const { calls } = captureFetch();
    const storage = new S3RecordingStorage(config);

    await storage.put("calls/a.wav", body([1, 2, 3, 4]), "audio/wav");
    await storage.put("calls/a.wav", body([5, 6, 7, 8]), "audio/wav");

    expect(calls[0]?.headers.authorization).not.toBe(
      calls[1]?.headers.authorization,
    );
  });

  it("names the recording it could not store", async () => {
    captureFetch(403);

    await expect(
      new S3RecordingStorage(config).put(
        "calls/session-1/0001-operator.wav",
        body([1, 2]),
        "audio/wav",
      ),
    ).rejects.toThrow("calls/session-1/0001-operator.wav");
  });
});

describe(`${S3RecordingStorage.name} reading a recording back`, () => {
  it("signs a read the way a compatible store expects", async () => {
    const { calls } = captureFetch();

    await new S3RecordingStorage(config).get("calls/session-1/manifest.json");

    const headers = calls[0]?.headers ?? {};
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe(
      "http://127.0.0.1:9000/call-recordings/calls/session-1/manifest.json",
    );
    // У чтения нет тела, но подпись всё равно требует его хеш.
    expect(headers["x-amz-content-sha256"]).toBe(
      createHash("sha256").update("").digest("hex"),
    );
    expect(headers.authorization).toContain(
      "SignedHeaders=host;x-amz-content-sha256;x-amz-date",
    );
  });

  it("answers with nothing for a recording that was never stored", async () => {
    captureFetch(404);

    // Занятие могло идти с выключенной записью: это не поломка разбора.
    await expect(
      new S3RecordingStorage(config).get("calls/session-1/0001-operator.wav"),
    ).resolves.toBeNull();
  });

  it("names the recording it could not read", async () => {
    captureFetch(500);

    await expect(
      new S3RecordingStorage(config).get("calls/session-1/0001-operator.wav"),
    ).rejects.toThrow("calls/session-1/0001-operator.wav");
  });
});
