import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

import { generateId } from "@/common/utils/id";

interface RequestWithMeta extends Request {
  requestId?: string;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const now = Date.now();

    const request = context.switchToHttp().getRequest<RequestWithMeta>();
    const response = context.switchToHttp().getResponse<Response>();

    const { method, url, headers } = request;
    const userAgent = (headers["user-agent"] as string) || "unknown";
    const ip = this.getClientIp(request);

    const requestId = (headers["x-request-id"] as string) || generateId();

    // Propagate requestId on the request object so services can access it
    request.requestId = requestId;

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
          const statusCode =
            error instanceof HttpException ? error.getStatus() : 500;
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

  private getClientIp(request: Request): string {
    const forwarded = request.headers["x-forwarded-for"];
    if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
    return request.socket?.remoteAddress || "unknown";
  }
}
