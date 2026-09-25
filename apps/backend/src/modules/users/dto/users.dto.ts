import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { AuthUserSchema } from "@/modules/auth/dto/auth-session.dto";
import {
  CreateUserSchema,
  UpdateUserSchema,
} from "@/modules/auth/dto/create-user.dto";
import { USER_ROLES } from "@/drizzle/schema";

/** Учётную запись любой роли создаёт администратор (ТЗ, стр. 9). */
export class CreateUserDto extends createZodDto(CreateUserSchema) {}
export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
export class UserDto extends createZodDto(AuthUserSchema) {}
export class UserListDto extends createZodDto(
  z.object({ users: z.array(AuthUserSchema) }).strict(),
) {}

export const ListUsersQuerySchema = z
  .object({
    role: z.enum(USER_ROLES).optional(),
    status: z.enum(["active", "inactive"]).optional(),
    search: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export class ListUsersQueryDto extends createZodDto(ListUsersQuerySchema) {}
