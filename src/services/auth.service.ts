import {
  type AuthCredentials,
  type AuthSession,
  AuthSessionSchema,
  type AuthUser,
  AuthUserSchema,
} from "../contracts/auth";
import { ApiRoutes } from "../config/api";
import { ApiError, api } from "../lib/api";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AUTH_LOGIN_INVALID_CREDENTIALS: "Неверный email или пароль",
  AUTH_TOKEN_INVALID: "Сессия истекла, войдите заново",
  AUTH_USER_NOT_FOUND: "Учётная запись отключена",
  VALIDATION_FAILED: "Проверьте введённые данные",
};

export async function login(
  credentials: AuthCredentials,
): Promise<AuthSession> {
  const session = await api.post<unknown>(ApiRoutes.auth.login, credentials);

  return AuthSessionSchema.parse(session);
}

export async function getCurrentUser(): Promise<AuthUser> {
  const user = await api.get<unknown>(ApiRoutes.auth.me);

  return AuthUserSchema.parse(user);
}

/** Backend messages are English and code-driven; this is what the operator sees. */
export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // Throttled logins arrive as a generic 429 without an auth-specific code.
    if (error.status === 429) {
      return "Слишком много попыток входа. Попробуйте через минуту";
    }

    return (
      (error.code && AUTH_ERROR_MESSAGES[error.code]) ??
      error.message ??
      "Не удалось войти"
    );
  }

  return "Не удалось войти. Попробуйте позже";
}
