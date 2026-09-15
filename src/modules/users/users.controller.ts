import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ZodSerializerDto } from "nestjs-zod";

import { ApiRoutes } from "@/contracts";
import { USER_ROLES, type UserRole } from "@/drizzle/schema";
import { AppBadRequestException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";

import {
  CreateUserDto,
  UpdateUserDto,
  UserDto,
  UserListDto,
} from "./dto/users.dto";
import { UsersService } from "./users.service";

@Controller(ApiRoutes.Users)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @ZodSerializerDto(UserDto)
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateUserDto) {
    return this.users.create(request.user.sub, body);
  }

  /** Список для выбора, например преподавателя группы: `?role=instructor`. */
  @Get()
  @ZodSerializerDto(UserListDto)
  async list(@Query("role") role?: string) {
    if (role !== undefined && !USER_ROLES.includes(role as UserRole)) {
      throw new AppBadRequestException(
        ErrorCodes.VALIDATION_FAILED,
        "Unknown user role",
      );
    }
    return { users: await this.users.list(role as UserRole | undefined) };
  }

  @Patch(":userId")
  @ZodSerializerDto(UserDto)
  update(
    @Req() request: AuthenticatedRequest,
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Body() body: UpdateUserDto,
  ) {
    return this.users.update(request.user.sub, userId, body);
  }
}
