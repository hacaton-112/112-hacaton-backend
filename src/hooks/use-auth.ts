import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import type { AuthCredentials, AuthSession } from "../contracts/auth";
import type { ApiError } from "../lib/api";
import { authService } from "../services/auth.service";
import { hydrateAuthStore, useAuthStore } from "../stores/auth.store";

export function useAuthLogin() {
  const signIn = useAuthStore((state) => state.signIn);

  return useMutation<AuthSession, ApiError, AuthCredentials>({
    mutationFn: authService.login,
    onSuccess: signIn,
  });
}

export function useAuthLogout() {
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const signOut = useAuthStore((state) => state.signOut);

  return useMutation<void, ApiError>({
    mutationFn: () =>
      refreshToken ? authService.logout({ refreshToken }) : Promise.resolve(),
    onSettled: signOut,
  });
}

/**
 * Exchanges the persisted refresh token for a fresh rotated session before
 * protected UI is rendered.
 */
export function useAuthSession(): void {
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const accessTokenExpiresAt = useAuthStore(
    (state) => state.accessTokenExpiresAt,
  );
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const user = useAuthStore((state) => state.user);
  const signIn = useAuthStore((state) => state.signIn);
  const signOut = useAuthStore((state) => state.signOut);

  useEffect(() => {
    if (!isHydrated) void hydrateAuthStore();
  }, [isHydrated]);

  const session = useQuery({
    queryKey: ["auth", "session", refreshToken],
    queryFn: () => authService.refresh({ refreshToken: refreshToken! }),
    enabled: isHydrated && Boolean(refreshToken) && !user,
    retry: false,
  });

  useEffect(() => {
    if (session.data) signIn(session.data);
  }, [session.data, signIn]);

  useEffect(() => {
    if (session.isError) signOut();
  }, [session.isError, signOut]);

  useEffect(() => {
    if (!user || !refreshToken || !accessTokenExpiresAt) return;

    // Rotate one minute before access expiry so a reconnecting Rust WebSocket
    // never starts with a stale Bearer token.
    const delay = Math.max(accessTokenExpiresAt - Date.now() - 60_000, 0);
    const timeout = window.setTimeout(() => {
      void authService.refresh({ refreshToken }).then(signIn).catch(signOut);
    }, delay);

    return () => window.clearTimeout(timeout);
  }, [accessTokenExpiresAt, refreshToken, signIn, signOut, user]);
}
