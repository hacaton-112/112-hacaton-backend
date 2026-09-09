import { createTauriStore } from "@tauri-store/zustand";
import { create } from "zustand";

import type { AuthSession, AuthUser } from "../contracts/auth";

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

  signOut: () =>
    set({
      accessToken: null,
      accessTokenExpiresAt: null,
      refreshToken: null,
      user: null,
    }),
}));

// Access tokens are short-lived. Persist only the rotating refresh credential;
// startup exchanges it for a fresh session before protected UI is rendered.
const authTauriStore = createTauriStore("auth", useAuthStore, {
  filterKeys: ["refreshToken"],
  filterKeysStrategy: "pick",
  saveOnChange: true,
});

/**
 * Outside the Tauri runtime (`bun run dev` in a browser) there is no backend to
 * sync with; the store then simply stays in memory for that session.
 */
export const hydrateAuthStore = (): Promise<void> =>
  authTauriStore
    .start()
    .catch(() => undefined)
    .finally(() => useAuthStore.setState({ isHydrated: true }));

export const getAccessToken = (): string | null =>
  useAuthStore.getState().accessToken;

export const getRefreshToken = (): string | null =>
  useAuthStore.getState().refreshToken;
