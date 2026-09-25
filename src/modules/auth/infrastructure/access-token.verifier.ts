import { Inject, Injectable, Logger } from "@nestjs/common";

import { TOKEN_VERIFIER } from "../auth.tokens";
import {
  type VerifiedJwtPayload,
  VerifiedJwtPayloadSchema,
} from "../dto/jwt-payload.dto";
import { JWT_ALGORITHMS } from "../domain/jwt.constants";
import type { TokenVerifier } from "../ports/token-verifier.port";

/** The scheme is case-insensitive per RFC 6750. */
const BEARER_PATTERN = /^Bearer[ \t]+(\S+)$/i;

export const extractBearerToken = (
  header: string | undefined,
): string | undefined => BEARER_PATTERN.exec(header ?? "")?.[1];

/**
 * Shared access-token check for every transport: HTTP through `JwtAuthGuard`
 * and WebSocket through the gateway handshake.
 */
@Injectable()
export class AccessTokenVerifier {
  private readonly logger = new Logger(AccessTokenVerifier.name);

  constructor(
    @Inject(TOKEN_VERIFIER) private readonly tokenVerifier: TokenVerifier,
  ) {}

  /**
   * Returns `null` for every rejection so callers cannot leak the reason to the
   * client — a distinguishable reason only helps an attacker probe tokens. The
   * reason is written to the server log instead, otherwise a misconfigured
   * secret and a credential-stuffing run look identical from the outside.
   */
  async verify(
    authorizationHeader: string | undefined,
  ): Promise<VerifiedJwtPayload | null> {
    const token = extractBearerToken(authorizationHeader);

    if (token === undefined) {
      this.logger.warn("Rejected a request without a Bearer access token");

      return null;
    }

    let payload: unknown;

    try {
      payload = await this.tokenVerifier.verifyAsync(token, {
        algorithms: JWT_ALGORITHMS,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      this.logger.warn(`Rejected an unverifiable access token: ${reason}`);

      return null;
    }

    // Signature, expiry and algorithm are checked above; the claims still have
    // to match the current shape, since a token signed by an older revision
    // may not carry it.
    const result = VerifiedJwtPayloadSchema.safeParse(payload);

    if (!result.success) {
      this.logger.warn("Rejected an access token with unexpected claims");

      return null;
    }

    return result.data;
  }
}
