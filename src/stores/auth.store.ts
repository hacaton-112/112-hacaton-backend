import { create } from "zustand";

import type { AuthSession, AuthUser } from "../contracts/auth";
import { clearActiveTrainingSession } from "../lib/active-call-session";

/** A type alias, not an interface: the plugin's `State` needs an index signature. */
type AuthState = {
  accessToken: string | null;
  accessTokenExpiresAt: number | null;
  refreshToken: string | null;
  user: AuthUser | null;
  /** Flips once the persisted state has been read from disk (or proven absent). */
  isHydrated: boolean;
  signIn: (session: AuthSession) => void;
  signOut: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  accessTokenExpiresAt: null,
  refreshToken: null,
  user: null,
  isHydrated: false,

  signIn: (session) =>
    set({
      accessToken: session.accessToken,
      accessTokenExpiresAt: Date.now() + session.expiresIn * 1_000,
      refreshToken: session.refreshToken,
      user: session.user,
    }),

  signOut: () => {
    // Осознанный выход — не обрыв связи: восстанавливать нечего, и окно
    // оператора не должно встретить следующий вход баннером восстановления.
    clearActiveTrainingSession();
    set({
      accessToken: null,
      accessTokenExpiresAt: null,
      refreshToken: null,
      user: null,
    });
  },
}));

const REFRESH_TOKEN_KEY = "trainer-112-refresh-token";

// Access token остаётся только в памяти; на диск попадает лишь вращаемый
// refresh token, необходимый для восстановления сессии после перезагрузки.
useAuthStore.subscribe((state) => {
  if (typeof window === "undefined") return;
  try {
    if (state.refreshToken)
      window.localStorage.setItem(REFRESH_TOKEN_KEY, state.refreshToken);
    else window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // Запрет хранилища не должен мешать работе текущей вкладки.
  }
});

export const hydrateAuthStore = async (): Promise<void> => {
  let refreshToken: string | null = null;
  try {
    refreshToken =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    refreshToken = null;
  }
  useAuthStore.setState({ refreshToken, isHydrated: true });
};

export const getAccessToken = (): string | null =>
  useAuthStore.getState().accessToken;

export const getRefreshToken = (): string | null =>
  useAuthStore.getState().refreshToken;
