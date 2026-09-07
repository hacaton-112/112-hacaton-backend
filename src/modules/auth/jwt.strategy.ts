import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

import { AppUnauthorizedException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";
import { env } from "@/core/config/env.config";

import {
  type VerifiedJwtPayload,
  VerifiedJwtPayloadSchema,
} from "./dto/jwt-payload.dto";

export const JWT_STRATEGY = "jwt";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, JWT_STRATEGY) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.JWT_SECRET,
    });
  }

  /**
   * Passport only checks the signature and expiry, so the claims are validated
   * here: a token signed by an older revision may not carry the current shape.
   */
  validate(payload: unknown): VerifiedJwtPayload {
    const result = VerifiedJwtPayloadSchema.safeParse(payload);

    if (!result.success) {
      throw new AppUnauthorizedException(
        ErrorCodes.AUTH_TOKEN_INVALID,
        "Access token is invalid or expired",
      );
    }

    return result.data;
  }
}
