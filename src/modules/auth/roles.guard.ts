import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { AppForbiddenException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";
import type { UserRole } from "@/drizzle/schema";

import type { AuthenticatedRequest } from "./jwt-auth.guard";
import { ROLES_METADATA_KEY } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedRoles = this.reflector.getAllAndOverride<readonly UserRole[]>(
      ROLES_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (allowedRoles === undefined || allowedRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (request.user && allowedRoles.includes(request.user.role)) {
      return true;
    }

    throw new AppForbiddenException(
      ErrorCodes.AUTH_ROLE_FORBIDDEN,
      "The current role cannot perform this action",
    );
  }
}
