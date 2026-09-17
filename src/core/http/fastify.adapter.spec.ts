import {
  Body,
  Controller,
  Get,
  Header,
  Module,
  Param,
  Post,
  Req,
  StreamableFile,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { FastifyRequest } from "fastify";

import { GlobalExceptionFilter } from "@/common/filters/global-exception.filter";
import { ErrorCodes } from "@/contracts";
import { readClassifierUpload } from "@/modules/classifier/infrastructure/fastify-classifier-upload";
import { HttpMetrics } from "@/modules/metrics/application/http-metrics";
import { MetricsRegistry } from "@/modules/metrics/application/metrics.registry";

import {
  configureFastifyRequestLifecycle,
  createFastifyAdapter,
  type FastifyNestApplication,
  registerFastifyPlugins,
} from "./fastify.adapter";

@Controller("probe")
class ProbeController {
  @Get(":id")
  read(@Param("id") id: string): { id: string } {
    return { id };
  }

  @Get("file/download")
  @Header("Content-Type", "application/octet-stream")
  file(): StreamableFile {
    return new StreamableFile(Buffer.from("recording"));
  }

  @Post("body")
  body(@Body() body: unknown): unknown {
    return body;
  }

  @Post("upload")
  async upload(@Req() request: FastifyRequest) {
    const upload = await readClassifierUpload(request);

    return {
      filename: upload?.originalname,
      size: upload?.size,
    };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe("Fastify HTTP platform", () => {
  let app: FastifyNestApplication;
  let metrics: MetricsRegistry;

  beforeAll(async () => {
    const adapter = createFastifyAdapter();
    metrics = new MetricsRegistry();
    app = await NestFactory.create<FastifyNestApplication>(
      ProbeModule,
      adapter,
      { logger: false },
    );
    configureFastifyRequestLifecycle(adapter, new HttpMetrics(metrics));
    await registerFastifyPlugins(app);
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(() => app.close());

  it("keeps Express-compatible route casing and trailing slashes", async () => {
    const response = await app.inject({
      headers: { "x-request-id": "request-42" },
      method: "GET",
      url: "/PROBE/session-42/",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: "session-42" });
    expect(response.headers["x-request-id"]).toBe("request-42");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(await metrics.render()).toContain(
      'route="/probe/:id",status_code="200"',
    );
  });

  it("returns the stable envelope for Fastify parser errors", async () => {
    const response = await app.inject({
      headers: {
        "content-type": "application/json",
        "x-request-id": "x".repeat(129),
      },
      method: "POST",
      payload: "{",
      url: "/probe/body",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      statusCode: 400,
      code: ErrorCodes.INTERNAL_ERROR,
      errors: [],
    });
    expect(response.headers["x-request-id"]).not.toBe("x".repeat(129));
  });

  it("registers bounded Fastify multipart parsing", async () => {
    const boundary = "fastify-test-boundary";
    const payload = [
      `--${boundary}\r\n`,
      'Content-Disposition: form-data; name="file"; filename="classifier.xlsx"\r\n',
      "Content-Type: application/octet-stream\r\n\r\n",
      "workbook",
      `\r\n--${boundary}--\r\n`,
    ].join("");

    const response = await app.inject({
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      method: "POST",
      payload,
      url: "/probe/upload",
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ filename: "classifier.xlsx", size: 8 });
  });

  it("rejects multipart requests with more than one part", async () => {
    const boundary = "fastify-parts-limit";
    const payload = [
      `--${boundary}\r\n`,
      'Content-Disposition: form-data; name="file"; filename="one.xlsx"\r\n',
      "Content-Type: application/octet-stream\r\n\r\n",
      "one",
      `\r\n--${boundary}\r\n`,
      'Content-Disposition: form-data; name="file"; filename="two.xlsx"\r\n',
      "Content-Type: application/octet-stream\r\n\r\n",
      "two",
      `\r\n--${boundary}--\r\n`,
    ].join("");

    const response = await app.inject({
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      method: "POST",
      payload,
      url: "/probe/upload",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: ErrorCodes.CLASSIFIER_IMPORT_INVALID,
      errors: [],
    });
  });

  it("streams Nest StreamableFile responses through Fastify", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/probe/file/download",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/octet-stream");
    expect(response.body).toBe("recording");
  });
});
