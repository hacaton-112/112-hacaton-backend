import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

import { generateId } from "@/common/utils/id";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const now = Date.now();

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const response = context.switchToHttp().getResponse<FastifyReply>();

    const { method, url, headers } = request;
    const userAgentHeader = headers["user-agent"];
    const userAgent = Array.isArray(userAgentHeader)
      ? (userAgentHeader[0] ?? "unknown")
      : (userAgentHeader ?? "unknown");
    const ip = this.getClientIp(request);
    const requestId = request.id;

    const classRef = context.getClass();
    const handlerRef = context.getHandler();
    const className = classRef.name;
    const handlerName = handlerRef.name;

    this.logger.log(
      `Incoming Request [${requestId}]: ${method} ${url} - ${ip} - ${userAgent}`,
      {
        type: "request",
        requestId,
        method,
        url,
        ip,
        userAgent,
        className,
        handlerName,
      },
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = response.statusCode;
          const responseTime = Date.now() - now;
          this.logger.log(
            `Outgoing Response [${requestId}]: ${method} ${url} - ${statusCode} - ${responseTime}ms`,
            {
              type: "response",
              requestId,
              method,
              url,
              statusCode,
              responseTime,
              className,
              handlerName,
            },
          );
        },
        error: (error: unknown) => {
          const statusCode = this.getErrorStatus(error);
          const responseTime = Date.now() - now;
          const errorId = generateId();
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          const errorStack = error instanceof Error ? error.stack : undefined;

          this.logger.error(
            `Error Response [${requestId}]: ${method} ${url} - ${statusCode} - ${responseTime}ms`,
            {
              type: "response_error",
              requestId,
              errorId,
              method,
              url,
              statusCode,
              responseTime,
              className,
              handlerName,
              message: errorMessage,
              stack: errorStack,
            },
          );
        },
      }),
    );
  }

  private getClientIp(request: FastifyRequest): string {
    return request.ip || request.raw.socket.remoteAddress || "unknown";
  }

  private getErrorStatus(error: unknown): number {
    if (error instanceof HttpException) return error.getStatus();
    if (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
    ) {
      return error.statusCode;
    }

    return 500;
  }
}
