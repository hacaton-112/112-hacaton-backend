import type { JwtAlgorithm } from "../domain/jwt.constants";

/**
 * Narrow port over the JWT library.
 *
 * Consumers depend on this instead of `JwtService` directly: `@nestjs/jwt` is
 * ESM-only and cannot be required from the CommonJS test runner, and nothing
 * outside the module needs more than verification.
 */
export interface TokenVerifier {
  verifyAsync(
    token: string,
    options: { algorithms: JwtAlgorithm[] },
  ): Promise<unknown>;
}
