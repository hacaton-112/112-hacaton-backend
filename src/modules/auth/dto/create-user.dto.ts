import { z } from "zod";

import {
  EmailSchema,
  FullNameSchema,
  PasswordSchema,
  UserRoleSchema,
} from "./auth-fields";

/**
 * Accounts are provisioned by an administrator (`bun run user:create`), not
 * through a public sign-up route, so this input has no HTTP DTO counterpart.
 */
export const CreateUserSchema = z
  .object({
    email: EmailSchema,
    password: PasswordSchema,
    fullName: FullNameSchema,
    role: UserRoleSchema.default("operator"),
  })
  .strict();

export type CreateUser = z.infer<typeof CreateUserSchema>;

/** Правка учётной записи администратором: пароль меняется, только если задан. */
export const UpdateUserSchema = z
  .object({
    email: EmailSchema.optional(),
    password: PasswordSchema.optional(),
    fullName: FullNameSchema.optional(),
    role: UserRoleSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one user field is required",
  });

export type UpdateUser = z.infer<typeof UpdateUserSchema>;
