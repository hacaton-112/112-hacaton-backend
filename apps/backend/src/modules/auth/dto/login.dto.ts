import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { EmailSchema, MAX_PASSWORD_LENGTH } from "./auth-fields";

/**
 * Login accepts any non-empty password on purpose: complexity rules apply to
 * account creation only, so tightening them later cannot lock out existing users.
 */
export const LoginSchema = z
  .object({
    email: EmailSchema,
    password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  })
  .strict();

export class LoginDto extends createZodDto(LoginSchema) {}

export type Login = z.infer<typeof LoginSchema>;
