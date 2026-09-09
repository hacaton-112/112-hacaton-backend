import {
  type AuthCredentials,
  type AuthSession,
  AuthSessionSchema,
  type AuthUser,
  AuthUserSchema,
  type RefreshTokenPayload,
} from "../contracts/auth";
import { API_CONFIG } from "../config/api";
import { api } from "../lib/api";

export const authService = {
  async login(credentials: AuthCredentials): Promise<AuthSession> {
    const session = await api.post<unknown>(
      API_CONFIG.getLoginUrl(),
      credentials,
    );

    return AuthSessionSchema.parse(session);
  },

  async getCurrentUser(): Promise<AuthUser> {
    const user = await api.get<unknown>(API_CONFIG.getCurrentUserUrl());

    return AuthUserSchema.parse(user);
  },

  async refresh(payload: RefreshTokenPayload): Promise<AuthSession> {
    return api.refreshSession(payload.refreshToken);
  },

  async logout(payload: RefreshTokenPayload): Promise<void> {
    await api.post<void>(API_CONFIG.getLogoutUrl(), payload);
  },
};
