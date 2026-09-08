import { Module } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";

import { env } from "@/core/config/env.config";

import { AccessTokenVerifier } from "./access-token.verifier";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TOKEN_SIGNER, TOKEN_VERIFIER } from "./auth.tokens";
import { JWT_ALGORITHM } from "./jwt.constants";
import { JWT_STRATEGY, JwtStrategy } from "./jwt.strategy";
import type { TokenSigner } from "./ports/token-signer.port";
import type { TokenVerifier } from "./ports/token-verifier.port";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: JWT_STRATEGY }),
    JwtModule.register({
      secret: env.JWT_SECRET,
      // The algorithm is pinned on both sides from the same constant; the
      // verifier rejects anything else, so the two must not drift apart.
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
    JwtStrategy,
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
  // TOKEN_VERIFIER travels with AccessTokenVerifier: a module that verifies
  // tokens in its own context would otherwise fail to construct it.
  exports: [AuthService, AccessTokenVerifier, TOKEN_VERIFIER],
})
export class AuthModule {}
