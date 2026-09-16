import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { FullNameSchema, UserIdSchema, UserRoleSchema } from "./auth-fields";

export const AuthUserSchema = z
  .object({
    id: UserIdSchema,
    email: z.email(),
    fullName: FullNameSchema,
    role: UserRoleSchema,
    isActive: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const AuthSessionSchema = z
  .object({
    accessToken: z.string().min(1),
    tokenType: z.literal("Bearer"),
    expiresIn: z.number().int().positive(),
    /** Opaque secret, exchanged at /auth/refresh and rotated on every use. */
    refreshToken: z.string().min(1),
    refreshExpiresIn: z.number().int().positive(),
    user: AuthUserSchema,
  })
  .strict();

export class AuthUserDto extends createZodDto(AuthUserSchema) {}
export class AuthSessionDto extends createZodDto(AuthSessionSchema) {}

export type AuthUser = z.infer<typeof AuthUserSchema>;
export type AuthSession = z.infer<typeof AuthSessionSchema>;
