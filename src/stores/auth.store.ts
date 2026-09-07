import { createTauriStore } from "@tauri-store/zustand";
import { create } from "zustand";

import type { AuthSession, AuthUser } from "../contracts/auth";

/** A type alias, not an interface: the plugin's `State` needs an index signature. */
type AuthState = {
  accessToken: string | null;
  user: AuthUser | null;
  /** Flips once the persisted state has been read from disk (or proven absent). */
  isHydrated: boolean;
  signIn: (session: AuthSession) => void;
  signOut: () => void;
  setUser: (user: AuthUser) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isHydrated: false,

  signIn: (session) =>
    set({ accessToken: session.accessToken, user: session.user }),

  signOut: () => set({ accessToken: null, user: null }),

  setUser: (user) => set({ user }),
}));

// The profile is refetched on every start, so only the token is worth persisting.
const authTauriStore = createTauriStore("auth", useAuthStore, {
  filterKeys: ["accessToken"],
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
