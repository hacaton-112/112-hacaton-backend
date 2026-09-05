import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Response } from "express";
import { ZodValidationException } from "nestjs-zod";

import { ErrorCodes } from "@/contracts/error-codes";
import { AppException } from "../exceptions/app.exception";

interface HealthCheckDetail {
  status: string;
  message?: string;
}

interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  errors: Array<{ path: string[]; message: string }>;
  details?: Record<string, HealthCheckDetail>;
  timestamp: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const errorResponse = this.buildErrorResponse(exception);

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private buildErrorResponse(exception: unknown): ErrorResponse {
    const timestamp = new Date().toISOString();

    // 1. Zod validation errors (nestjs-zod)
    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError() as {
        issues: Array<{
          path: (string | number)[];
          message: string;
        }>;
      };

      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: ErrorCodes.VALIDATION_FAILED,
        message: "Validation failed",
        errors: zodError.issues.map((issue) => ({
          path: issue.path.map(String),
          message: issue.message,
        })),
        timestamp,
      };
    }

    // 2. Our custom AppException (has error code)
    if (exception instanceof AppException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        errors: [],
        timestamp,
      };
    }

    // 3. Terminus health check (ServiceUnavailableException with health details)
    if (exception instanceof ServiceUnavailableException) {
      const exceptionResponse = exception.getResponse() as Record<
        string,
        unknown
      >;

      // Terminus passes { status, details, error } in the response body
      const details = (exceptionResponse?.details ??
        exceptionResponse?.error ??
        {}) as Record<string, HealthCheckDetail>;

      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: ErrorCodes.SERVICE_UNAVAILABLE,
        message: "Service unavailable",
        errors: [],
        details,
        timestamp,
      };
    }

    // 4. Standard NestJS HTTP exceptions (no custom code)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      let message = exception.message;
      if (
        typeof exceptionResponse === "object" &&
        exceptionResponse !== null &&
        "message" in exceptionResponse
      ) {
        const msg = (exceptionResponse as Record<string, unknown>).message;
        message = Array.isArray(msg) ? msg.join(", ") : String(msg);
      }

      return {
        statusCode: status,
        code: ErrorCodes.INTERNAL_ERROR,
        message,
        errors: [],
        timestamp,
      };
    }

    // 5. Unknown errors
    this.logger.error(
      "Unhandled exception",
      exception instanceof Error ? exception.stack : String(exception),
    );

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCodes.INTERNAL_ERROR,
      message: "Internal server error",
      errors: [],
      timestamp,
    };
  }
}
