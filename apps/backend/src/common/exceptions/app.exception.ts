import { HttpException, HttpStatus } from "@nestjs/common";

import type { ErrorCode } from "../../contracts";

/**
 * Custom application exception that carries an error code for i18n.
 * Frontend uses the `code` field to display localized messages.
 */
export class AppException extends HttpException {
  public readonly code: ErrorCode;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ code, message, statusCode }, statusCode);
    this.code = code;
  }
}

// ── Convenience factories ────────────────────────────────────

export class AppNotFoundException extends AppException {
  constructor(code: ErrorCode, message: string) {
    super(code, message, HttpStatus.NOT_FOUND);
  }
}

export class AppConflictException extends AppException {
  constructor(code: ErrorCode, message: string) {
    super(code, message, HttpStatus.CONFLICT);
  }
}

export class AppForbiddenException extends AppException {
  constructor(code: ErrorCode, message: string) {
    super(code, message, HttpStatus.FORBIDDEN);
  }
}

export class AppUnauthorizedException extends AppException {
  constructor(code: ErrorCode, message: string) {
    super(code, message, HttpStatus.UNAUTHORIZED);
  }
}

export class AppBadRequestException extends AppException {
  constructor(code: ErrorCode, message: string) {
    super(code, message, HttpStatus.BAD_REQUEST);
  }
}

export class AppInternalException extends AppException {
  constructor(code: ErrorCode, message: string) {
    super(code, message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

export class AppServiceUnavailableException extends AppException {
  constructor(code: ErrorCode, message: string) {
    super(code, message, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
