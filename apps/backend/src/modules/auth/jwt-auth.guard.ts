import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { AppUnauthorizedException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";

import { AccessTokenVerifier } from "./infrastructure/access-token.verifier";
import type { VerifiedJwtPayload } from "./dto/jwt-payload.dto";

export interface AuthenticatedRequest extends FastifyRequest {
  user: VerifiedJwtPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly accessTokenVerifier: AccessTokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.accessTokenVerifier.verify(
      request.headers.authorization,
    );

    if (user === null) {
      throw new AppUnauthorizedException(
        ErrorCodes.AUTH_TOKEN_INVALID,
        "Access token is missing, invalid or expired",
      );
    }

    request.user = user;

    return true;
  }
}
