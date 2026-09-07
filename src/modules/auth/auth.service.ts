import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
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

import type { AuthSession, AuthUser } from "./dto/auth-session.dto";
import type { CreateUser } from "./dto/create-user.dto";
import type { Login } from "./dto/login.dto";
import type { JwtPayload } from "./dto/jwt-payload.dto";

const SALT_ROUNDS = 12;
// Verified against a throwaway digest so a missing account and a wrong password
// cost the same time and cannot be told apart by the caller.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  "password-placeholder",
  SALT_ROUNDS,
);

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService["db"],
    private readonly jwtService: JwtService,
  ) {}

  async login({ email, password }: Login): Promise<AuthSession> {
    const user = await this.findByEmail(email);
    const passwordMatches = await bcrypt.compare(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordMatches) {
      throw new AppUnauthorizedException(
        ErrorCodes.AUTH_LOGIN_INVALID_CREDENTIALS,
        "Invalid email or password",
      );
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: "Bearer",
      expiresIn: env.JWT_ACCESS_TTL_SECONDS,
      user: this.toAuthUser(user),
    };
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
