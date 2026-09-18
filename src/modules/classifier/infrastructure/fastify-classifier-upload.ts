import type { FastifyRequest } from "fastify";

import { AppBadRequestException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";

import {
  MAX_CLASSIFIER_FILE_BYTES,
  type ClassifierUpload,
} from "../classifier.service";

const MULTIPART_LIMIT_CODES = new Set([
  "ERR_STREAM_PREMATURE_CLOSE",
  "FST_FIELDS_LIMIT",
  "FST_FILES_LIMIT",
  "FST_PARTS_LIMIT",
  "FST_REQ_FILE_TOO_LARGE",
]);

const errorCode = (error: unknown): string | null =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof error.code === "string"
    ? error.code
    : null;

const invalidMultipart = (): AppBadRequestException =>
  new AppBadRequestException(
    ErrorCodes.CLASSIFIER_IMPORT_INVALID,
    "Classifier upload must contain one file up to 10 MiB and no extra fields",
  );

/**
 * `@fastify/multipart` is stream-first. Iterate to the end instead of calling
 * `request.file()`: the latter can leave a second part unread and turn a clean
 * parts-limit error into `ERR_STREAM_PREMATURE_CLOSE`.
 */
export const readClassifierUpload = async (
  request: FastifyRequest,
): Promise<ClassifierUpload | undefined> => {
  if (!request.isMultipart()) return undefined;

  try {
    let upload: ClassifierUpload | undefined;
    const parts = request.parts({
      limits: {
        fields: 0,
        files: 1,
        fileSize: MAX_CLASSIFIER_FILE_BYTES,
        parts: 1,
      },
    });

    for await (const part of parts) {
      if (part.type !== "file" || part.fieldname !== "file" || upload) {
        if (part.type === "file") part.file.resume();
        throw invalidMultipart();
      }

      const buffer = await part.toBuffer();
      upload = {
        originalname: part.filename,
        mimetype: part.mimetype,
        size: buffer.byteLength,
        buffer,
      };
    }

    return upload;
  } catch (error) {
    if (MULTIPART_LIMIT_CODES.has(errorCode(error) ?? "")) {
      throw invalidMultipart();
    }

    throw error;
  }
};
