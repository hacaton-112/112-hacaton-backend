import type { IncomingMessage } from "node:http";

import fastifyHelmet from "@fastify/helmet";
import fastifyMultipart from "@fastify/multipart";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import type { FastifyRequest } from "fastify";

import { generateId } from "@/common/utils/id";
import type { HttpMetrics } from "@/modules/metrics/application/http-metrics";

const MAX_REQUEST_ID_LENGTH = 128;
/** Свой идентификатор запроса клиент присылает, но не диктует его вид. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
/**
 * Потолок тела запроса.
 *
 * Самое большое законное тело — черновик сценария: до 64 фактов по тысяче
 * символов, реплики, обязательные вопросы и эталонная карточка. При прежних
 * ста килобайтах такой черновик не публиковался и не проверялся на
 * грамотность, а преподаватель видел только 413 без объяснения.
 */
const JSON_BODY_LIMIT_BYTES = 1024 * 1024;
const MAX_MULTIPART_FILE_BYTES = 10 * 1024 * 1024;

type StopTimer = ReturnType<HttpMetrics["duration"]["startTimer"]>;

const headerValue = (value: string | string[] | undefined): string | null => {
  const candidate = Array.isArray(value) ? value[0] : value;
  const trimmed = candidate?.trim() ?? "";

  return trimmed.length > 0 &&
    trimmed.length <= MAX_REQUEST_ID_LENGTH &&
    REQUEST_ID_PATTERN.test(trimmed)
    ? trimmed
    : null;
};

export const requestId = (request: IncomingMessage): string =>
  headerValue(request.headers["x-request-id"]) ?? generateId();

/**
 * Keep the routing behaviour clients had with Express while disabling the
 * compatibility middleware layer. All cross-cutting HTTP behaviour is wired
 * through native Fastify hooks instead.
 */
/**
 * За обратным прокси адрес клиента приходит заголовком, и доверять ему можно
 * ровно на столько шагов, сколько прокси стоит перед приложением. Ноль —
 * прямое подключение: заголовок игнорируется, иначе клиент подменил бы адрес
 * в журнале входов.
 */
export const createFastifyAdapter = (trustProxyHops = 0): FastifyAdapter => {
  const adapter = new FastifyAdapter({
    bodyLimit: JSON_BODY_LIMIT_BYTES,
    genReqId: requestId,
    routerOptions: {
      caseSensitive: false,
      ignoreTrailingSlash: true,
    },
    skipMiddie: true,
    trustProxy: trustProxyHops > 0 ? trustProxyHops : false,
  });
  // Auth guards assign a verified payload per request. Declaring the slot up
  // front keeps Fastify's request object shape stable under load.
  adapter.getInstance().decorateRequest("user", null);

  return adapter;
};

export const registerFastifyPlugins = async (
  app: FastifyNestApplication,
): Promise<void> => {
  await app.register(fastifyHelmet);
  // Multipart remains opt-in at route level. The global ceiling prevents a
  // future upload endpoint from accidentally buffering an unbounded body.
  await app.register(fastifyMultipart, {
    limits: {
      fields: 0,
      files: 1,
      fileSize: MAX_MULTIPART_FILE_BYTES,
      parts: 1,
    },
    throwFileSizeLimit: true,
  });
};

/**
 * Fastify's root hooks also see 404s and only finish after the response has
 * actually been sent. That makes them a better fit for HTTP metrics than a
 * Nest interceptor, especially for streamed recordings and report exports.
 */
export const configureFastifyRequestLifecycle = (
  adapter: FastifyAdapter,
  metrics: HttpMetrics,
): void => {
  const timers = new WeakMap<FastifyRequest, StopTimer>();

  adapter.setOnRequestHook((request, reply, done) => {
    timers.set(request, metrics.duration.startTimer());
    void reply.header("x-request-id", request.id);
    done();
  });

  adapter.setOnResponseHook((request, reply, done) => {
    const stopTimer = timers.get(request);
    if (stopTimer) {
      timers.delete(request);
      stopTimer({
        method: request.method,
        route: request.routeOptions.url || "unmatched",
        status_code: String(reply.statusCode),
      });
    }
    done();
  });
};

export type FastifyNestApplication = NestFastifyApplication;
