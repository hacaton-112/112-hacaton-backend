import type { FastifyRequest } from "fastify";

import { AppException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";

import { readClassifierUpload } from "@/modules/classifier/infrastructure/fastify-classifier-upload";

const request = (
  multipart: boolean,
  parts: FastifyRequest["parts"],
): FastifyRequest =>
  ({ isMultipart: () => multipart, parts }) as unknown as FastifyRequest;

const iterable = (...parts: unknown[]): ReturnType<FastifyRequest["parts"]> =>
  (async function* generate() {
    yield* parts;
  })() as ReturnType<FastifyRequest["parts"]>;

const failingIterable = (error: Error): ReturnType<FastifyRequest["parts"]> =>
  ({
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.reject(error),
    }),
  }) as ReturnType<FastifyRequest["parts"]>;

describe(readClassifierUpload.name, () => {
  it("returns undefined for a non-multipart request", async () => {
    const parts = jest.fn();

    await expect(
      readClassifierUpload(request(false, parts)),
    ).resolves.toBeUndefined();
    expect(parts).not.toHaveBeenCalled();
  });

  it("maps a bounded Fastify file part to the service contract", async () => {
    const buffer = Buffer.from("workbook");
    const parts = jest.fn().mockReturnValue(
      iterable({
        type: "file",
        fieldname: "file",
        filename: "classifier.xlsx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        toBuffer: jest.fn().mockResolvedValue(buffer),
      }),
    );

    await expect(readClassifierUpload(request(true, parts))).resolves.toEqual({
      originalname: "classifier.xlsx",
      mimetype:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: buffer.byteLength,
      buffer,
    });
    expect(parts).toHaveBeenCalledWith({
      limits: {
        fields: 0,
        files: 1,
        fileSize: 10 * 1024 * 1024,
        parts: 1,
      },
    });
  });

  it("does not accept a file under a different field name", async () => {
    const parts = jest.fn().mockReturnValue(
      iterable({
        type: "file",
        fieldname: "attachment",
        filename: "classifier.xlsx",
        mimetype: "application/octet-stream",
        file: { resume: jest.fn() },
        toBuffer: jest.fn().mockResolvedValue(Buffer.from("workbook")),
      }),
    );

    await expect(
      readClassifierUpload(request(true, parts)),
    ).rejects.toMatchObject({ code: ErrorCodes.CLASSIFIER_IMPORT_INVALID });
  });

  it("maps Fastify multipart limits to the stable API error", async () => {
    const parts = jest.fn().mockReturnValue(
      failingIterable(
        Object.assign(new Error("request file too large"), {
          code: "FST_REQ_FILE_TOO_LARGE",
        }),
      ),
    );

    const result = readClassifierUpload(request(true, parts));

    await expect(result).rejects.toBeInstanceOf(AppException);
    await expect(result).rejects.toMatchObject({
      code: ErrorCodes.CLASSIFIER_IMPORT_INVALID,
    });
  });
});
