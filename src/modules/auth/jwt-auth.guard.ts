import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request } from "express";

import { AppUnauthorizedException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";

import type { VerifiedJwtPayload } from "./dto/jwt-payload.dto";
import { JWT_STRATEGY } from "./jwt.strategy";

export interface AuthenticatedRequest extends Request {
  user: VerifiedJwtPayload;
}

@Injectable()
export class JwtAuthGuard extends AuthGuard(JWT_STRATEGY) {
  /** Replaces Passport's bare 401 with the coded error the frontend expects. */
  handleRequest<TUser = VerifiedJwtPayload>(
    error: unknown,
    user: TUser | false,
  ): TUser {
    if (error) {
      throw error;
    }

    if (!user) {
      throw new AppUnauthorizedException(
        ErrorCodes.AUTH_TOKEN_INVALID,
        "Access token is missing, invalid or expired",
      );
    }

    return user;
  }
}
