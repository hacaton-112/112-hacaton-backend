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
import type { Request } from "express";
import { ZodSerializerDto } from "nestjs-zod";

import { ApiRoutes } from "@/contracts";

import { AuthService } from "./auth.service";
import { readClientMetadata } from "./client-metadata";
import {
  type AuthSession,
  AuthSessionDto,
  type AuthUser,
  AuthUserDto,
} from "./dto/auth-session.dto";
import { LoginDto } from "./dto/login.dto";
import { type AuthenticatedRequest, JwtAuthGuard } from "./jwt-auth.guard";

@Controller(ApiRoutes.Auth)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  // Credential stuffing protection on top of the global limits.
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @ZodSerializerDto(AuthSessionDto)
  login(@Body() body: LoginDto, @Req() request: Request): Promise<AuthSession> {
    return this.auth.login(body, readClientMetadata(request));
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ZodSerializerDto(AuthUserDto)
  me(@Req() request: AuthenticatedRequest): Promise<AuthUser> {
    return this.auth.getProfile(request.user.sub);
  }
}
