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
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";

import {
  CreateUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
  UserDto,
  UserListDto,
} from "./dto/users.dto";
import { UsersService } from "./users.service";

const actor = (request: AuthenticatedRequest) => ({
  id: request.user.sub,
  role: request.user.role,
});

@Controller(ApiRoutes.Users)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "instructor")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @ZodSerializerDto(UserDto)
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateUserDto) {
    return this.users.create(actor(request), body);
  }

  /** Список для выбора, например преподавателя группы: `?role=instructor`. */
  @Get()
  @ZodSerializerDto(UserListDto)
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListUsersQueryDto,
  ) {
    return { users: await this.users.list(actor(request), query) };
  }

  @Patch(":userId")
  @ZodSerializerDto(UserDto)
  update(
    @Req() request: AuthenticatedRequest,
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Body() body: UpdateUserDto,
  ) {
    return this.users.update(actor(request), userId, body);
  }
}
