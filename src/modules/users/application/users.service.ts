import { Injectable } from "@nestjs/common";

import { AppForbiddenException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";

import { AuditLogService } from "@/modules/audit-log/application/audit-log.service";
import { AuthService } from "@/modules/auth/application/auth.service";
import type { AuthUser } from "@/modules/auth/dto/auth-session.dto";
import type {
  CreateUser,
  UpdateUser,
} from "@/modules/auth/dto/create-user.dto";
import type { ListUsersQueryDto } from "../dto/users.dto";

export interface UserActor {
  id: string;
  role: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditLogService,
  ) {}

  async create(actor: UserActor, input: CreateUser): Promise<AuthUser> {
    if (actor.role === "instructor" && input.role !== "operator") {
      throw new AppForbiddenException(
        ErrorCodes.AUTH_ROLE_FORBIDDEN,
        "Instructors can only create operator accounts",
      );
    }
    const user = await this.auth.createUser(input);
    // Пароль в журнал не попадает: только кто, кого и с какой ролью создал.
    await this.audit.log({
      actorId: actor.id,
      action: "user.created",
      resource: "user",
      resourceId: user.id,
      details: { email: user.email, role: user.role },
    });
    return user;
  }

  list(actor: UserActor, filters: ListUsersQueryDto): Promise<AuthUser[]> {
    if (actor.role === "instructor") {
      return this.auth.listUsers({ ...filters, role: "operator" });
    }
    return this.auth.listUsers(filters);
  }

  async update(
    actor: UserActor,
    userId: string,
    input: UpdateUser,
  ): Promise<AuthUser> {
    if (actor.role === "instructor") {
      if (input.role !== undefined && input.role !== "operator") {
        throw new AppForbiddenException(
          ErrorCodes.AUTH_ROLE_FORBIDDEN,
          "Instructors cannot change user roles",
        );
      }
    }
    // Администратор, снявший с себя роль, остался бы без доступа к этой форме.
    if (actor.id === userId && input.role && input.role !== "admin") {
      throw new AppForbiddenException(
        ErrorCodes.AUTH_ROLE_FORBIDDEN,
        "An administrator cannot change their own role",
      );
    }
    if (actor.id === userId && input.isActive === false) {
      throw new AppForbiddenException(
        ErrorCodes.AUTH_ROLE_FORBIDDEN,
        "An administrator cannot deactivate their own account",
      );
    }
    const user = await this.auth.updateUser(userId, input);
    const action =
      input.isActive === false
        ? "user.deactivated"
        : input.isActive === true
          ? "user.reactivated"
          : input.password !== undefined
            ? "user.password_reset"
            : input.role !== undefined
              ? "user.role_changed"
              : "user.updated";
    await this.audit.log({
      actorId: actor.id,
      action,
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
