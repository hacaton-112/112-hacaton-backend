import { z } from "zod";

const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;

export const UserRoleSchema = z.enum(["operator", "instructor", "admin"]);

export const AuthUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  fullName: z.string(),
  role: UserRoleSchema,
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const AuthSessionSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number().int().positive(),
  refreshToken: z.string().min(1),
  refreshExpiresIn: z.number().int().positive(),
  user: AuthUserSchema,
});

export const RefreshTokenPayloadSchema = z.object({
  refreshToken: z.string().min(1),
});

/** Mirrors the backend login contract; messages are shown in the form. */
export const AuthCredentialsSchema = z.object({
  // Логином служит рабочий email оператора — так его заводит администратор.
  email: z
    .string()
    .trim()
    .min(1, "Введите логин")
    .max(MAX_EMAIL_LENGTH, "Слишком длинный логин")
    .pipe(z.email("Логин указывается в формате email")),
  password: z
    .string()
    .min(1, "Введите пароль")
    .max(MAX_PASSWORD_LENGTH, "Слишком длинный пароль"),
});

export type UserRole = z.infer<typeof UserRoleSchema>;
export type AuthUser = z.infer<typeof AuthUserSchema>;
export type AuthSession = z.infer<typeof AuthSessionSchema>;
export type AuthCredentials = z.infer<typeof AuthCredentialsSchema>;
export type RefreshTokenPayload = z.infer<typeof RefreshTokenPayloadSchema>;
