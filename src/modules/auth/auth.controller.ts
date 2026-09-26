import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { FastifyRequest } from "fastify";
import { ZodSerializerDto } from "nestjs-zod";

import { ApiRoutes } from "@/contracts";

import { AuthService } from "./application/auth.service";
import { readClientMetadata } from "./domain/client-metadata";
import {
  type AuthSession,
  AuthSessionDto,
  type AuthUser,
  AuthUserDto,
} from "./dto/auth-session.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { type AuthenticatedRequest, JwtAuthGuard } from "./jwt-auth.guard";

@Controller(ApiRoutes.Auth)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  // Credential stuffing protection on top of the global limits.
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @ZodSerializerDto(AuthSessionDto)
  login(
    @Body() body: LoginDto,
    @Req() request: FastifyRequest,
  ): Promise<AuthSession> {
    return this.auth.login(body, readClientMetadata(request));
  }

  /**
   * Deliberately unguarded: the whole point is that the access token has
   * already expired by the time a client gets here.
   */
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @ZodSerializerDto(AuthSessionDto)
  refresh(@Body() body: RefreshTokenDto): Promise<AuthSession> {
    return this.auth.refresh(body.refreshToken);
  }

  /**
   * Idempotent and unguarded: holding the refresh token is what authorises
   * destroying it, and answering 204 for unknown, expired and revoked tokens
   * alike leaves no oracle for probing which ones are live. Requiring a valid
   * access token would make logout fail exactly when a user wants it most.
   */
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  logout(@Body() body: RefreshTokenDto): Promise<void> {
    return this.auth.logout(body.refreshToken);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ZodSerializerDto(AuthUserDto)
  me(@Req() request: AuthenticatedRequest): Promise<AuthUser> {
    return this.auth.getProfile(request.user.sub);
  }
}
