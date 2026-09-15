import { Injectable } from "@nestjs/common";

import { AppForbiddenException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";
import type { UserRole } from "@/drizzle/schema";

import { AuditLogService } from "@/modules/audit-log/audit-log.service";
import { AuthService } from "@/modules/auth/auth.service";
import type { AuthUser } from "@/modules/auth/dto/auth-session.dto";
import type {
  CreateUser,
  UpdateUser,
} from "@/modules/auth/dto/create-user.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditLogService,
  ) {}

  async create(actorId: string, input: CreateUser): Promise<AuthUser> {
    const user = await this.auth.createUser(input);
    // Пароль в журнал не попадает: только кто, кого и с какой ролью создал.
    await this.audit.log({
      actorId,
      action: "user.created",
      resource: "user",
      resourceId: user.id,
      details: { email: user.email, role: user.role },
    });
    return user;
  }

  list(role?: UserRole): Promise<AuthUser[]> {
    return this.auth.listUsers(role);
  }

  async update(
    actorId: string,
    userId: string,
    input: UpdateUser,
  ): Promise<AuthUser> {
    // Администратор, снявший с себя роль, остался бы без доступа к этой форме.
    if (actorId === userId && input.role && input.role !== "admin") {
      throw new AppForbiddenException(
        ErrorCodes.AUTH_ROLE_FORBIDDEN,
        "An administrator cannot change their own role",
      );
    }
    const user = await this.auth.updateUser(userId, input);
    await this.audit.log({
      actorId,
      action: "user.updated",
      resource: "user",
      resourceId: userId,
      details: {
        fields: Object.keys(input).filter((key) => key !== "password"),
        passwordChanged: input.password !== undefined,
      },
    });
    return user;
  }
}
