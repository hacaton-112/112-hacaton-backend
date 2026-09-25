import { Module } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";

import { env } from "@/core/config/env.config";

import { AccessTokenVerifier } from "./infrastructure/access-token.verifier";
import {
  type AuthSessionConfig,
  AuthSessionService,
} from "./application/auth-session.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./application/auth.service";
import {
  AUTH_SESSION_CONFIG,
  AUTH_SESSION_STORE,
  TOKEN_SIGNER,
  TOKEN_VERIFIER,
} from "./auth.tokens";
import { DrizzleAuthSessionStore } from "./infrastructure/drizzle-auth-session.store";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { JWT_ALGORITHM } from "./domain/jwt.constants";
import type { TokenSigner } from "./ports/token-signer.port";
import type { TokenVerifier } from "./ports/token-verifier.port";
import { RolesGuard } from "./roles.guard";

@Module({
  imports: [
    JwtModule.register({
      secret: env.JWT_SECRET,
      // The algorithm is pinned on both sides from the same constant; the
      // guard rejects anything else, so the two must not drift apart.
      signOptions: {
        algorithm: JWT_ALGORITHM,
        expiresIn: env.JWT_ACCESS_TTL_SECONDS,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccessTokenVerifier,
    AuthSessionService,
    JwtAuthGuard,
    RolesGuard,
    DrizzleAuthSessionStore,
    { provide: AUTH_SESSION_STORE, useExisting: DrizzleAuthSessionStore },
    // Lifetimes arrive as a value rather than being read from env inside the
    // service: @t3-oss/env-core is ESM-only and cannot be loaded by the test
    // runner, and a spec needs to vary the TTLs to cover the expiry rules.
    {
      provide: AUTH_SESSION_CONFIG,
      useValue: {
        refreshTokenTtlSeconds: env.AUTH_REFRESH_TOKEN_TTL_SECONDS,
        sessionTtlSeconds: env.AUTH_SESSION_TTL_SECONDS,
      } satisfies AuthSessionConfig,
    },
    // Factories rather than `useExisting`, so TypeScript checks that
    // `JwtService` still satisfies the ports.
    {
      provide: TOKEN_SIGNER,
      inject: [JwtService],
      useFactory: (jwtService: JwtService): TokenSigner => jwtService,
    },
    {
      provide: TOKEN_VERIFIER,
      inject: [JwtService],
      useFactory: (jwtService: JwtService): TokenVerifier => jwtService,
    },
  ],
  // TOKEN_VERIFIER travels with AccessTokenVerifier and JwtAuthGuard: a module
  // that applies the guard resolves it in its own context and would otherwise
  // fail to construct it.
  exports: [
    AuthService,
    AccessTokenVerifier,
    JwtAuthGuard,
    RolesGuard,
    TOKEN_VERIFIER,
  ],
})
export class AuthModule {}
