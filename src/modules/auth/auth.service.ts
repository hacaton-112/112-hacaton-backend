import { Inject, Injectable, Logger } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import {
  AppConflictException,
  AppUnauthorizedException,
} from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";
import { env } from "@/core/config/env.config";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import { generateId } from "@/common/utils/id";
import { type UserRecord, users } from "@/drizzle/schema";

// Imported as a value, not a type: `import type` is erased before decorator
// metadata is emitted, and Nest would receive Object instead of the class.
import {
  AuthSessionService,
  type ClientMetadata,
  type IssuedRefreshToken,
} from "./auth-session.service";
import { TOKEN_SIGNER } from "./auth.tokens";
import type { AuthSession, AuthUser } from "./dto/auth-session.dto";
import type { CreateUser } from "./dto/create-user.dto";
import type { Login } from "./dto/login.dto";
import type { JwtPayload } from "./dto/jwt-payload.dto";
import type { TokenSigner } from "./ports/token-signer.port";

const SALT_ROUNDS = 12;
// Verified against a throwaway digest so a missing account and a wrong password
// cost the same time and cannot be told apart by the caller.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  "password-placeholder",
  SALT_ROUNDS,
);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService["db"],
    @Inject(TOKEN_SIGNER) private readonly tokenSigner: TokenSigner,
    private readonly sessions: AuthSessionService,
  ) {}

  async login(
    { email, password }: Login,
    metadata: ClientMetadata,
  ): Promise<AuthSession> {
    const user = await this.findByEmail(email);
    const passwordMatches = await bcrypt.compare(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordMatches) {
      // Logged without the address: the entry exists so a burst of failures is
      // visible in the server log, not to record who tried to sign in.
      this.logger.warn(
        `Rejected a login attempt: ${user ? "wrong password" : "unknown account"}`,
      );

      throw new AppUnauthorizedException(
        ErrorCodes.AUTH_LOGIN_INVALID_CREDENTIALS,
        "Invalid email or password",
      );
    }

    // Issued only after the credentials check, so a failed attempt leaves no
    // extra work behind that could be measured.
    const issued = await this.sessions.issue(user.id, metadata);

    return this.createSession(user, issued);
  }

  /** Exchanges a refresh token for a fresh pair, rotating the old one away. */
  async refresh(refreshToken: string): Promise<AuthSession> {
    const rotated = await this.sessions.rotate(refreshToken);
    const user = await this.findById(rotated.userId);

    if (!user) {
      // Deliberately the refresh error rather than AUTH_USER_NOT_FOUND: a
      // deleted account must not be observable through this endpoint.
      throw new AppUnauthorizedException(
        ErrorCodes.AUTH_REFRESH_TOKEN_INVALID,
        "Refresh token is invalid or expired",
      );
    }

    return this.createSession(user, rotated);
  }

  /** Ends the session the token belongs to; unknown tokens are ignored. */
  async logout(refreshToken: string): Promise<void> {
    await this.sessions.revokeByToken(refreshToken);
  }

  async getProfile(userId: string): Promise<AuthUser> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new AppUnauthorizedException(
        ErrorCodes.AUTH_USER_NOT_FOUND,
        "Account no longer exists",
      );
    }

    return this.toAuthUser(user);
  }

  /** Provisioning path for administrators; not exposed over HTTP. */
  async createUser(input: CreateUser): Promise<AuthUser> {
    if (await this.findByEmail(input.email)) {
      throw new AppConflictException(
        ErrorCodes.AUTH_EMAIL_ALREADY_EXISTS,
        "Email is already registered",
      );
    }

    const [user] = await this.db
      .insert(users)
      .values({
        id: generateId(),
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, SALT_ROUNDS),
        fullName: input.fullName,
        role: input.role,
      })
      .returning();

    return this.toAuthUser(user);
  }

  private async createSession(
    user: UserRecord,
    issued: IssuedRefreshToken,
  ): Promise<AuthSession> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: await this.tokenSigner.signAsync(payload),
      tokenType: "Bearer",
      expiresIn: env.JWT_ACCESS_TTL_SECONDS,
      refreshToken: issued.refreshToken,
      refreshExpiresIn: issued.refreshExpiresIn,
      user: this.toAuthUser(user),
    };
  }

  private async findById(userId: string): Promise<UserRecord | undefined> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user;
  }

  private async findByEmail(email: string): Promise<UserRecord | undefined> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return user;
  }

  private toAuthUser(user: UserRecord): AuthUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
