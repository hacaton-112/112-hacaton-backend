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

/**
 * Loads the persisted token and revalidates it: a token left from a previous
 * run is not trusted until the backend confirms the account still exists.
 */
export function useAuthSession(): void {
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const signOut = useAuthStore((state) => state.signOut);

  useEffect(() => {
    if (!isHydrated) void hydrateAuthStore();
  }, [isHydrated]);

  const session = useQuery({
    queryKey: ["auth", "session", accessToken],
    queryFn: authService.getCurrentUser,
    enabled: isHydrated && Boolean(accessToken) && !user,
    retry: false,
  });

  useEffect(() => {
    if (session.data) setUser(session.data);
  }, [session.data, setUser]);

  useEffect(() => {
    if (session.isError) signOut();
  }, [session.isError, signOut]);
}
