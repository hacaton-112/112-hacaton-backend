import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";

import type { AuthCredentials, AuthSession } from "../contracts/auth";
import type { ApiError } from "../lib/api";
import { getCurrentUser, login } from "../services/auth.service";
import { hydrateAuthStore, useAuthStore } from "../stores/auth.store";

export function useAuthLogin() {
  const signIn = useAuthStore((state) => state.signIn);

  return useMutation<AuthSession, ApiError, AuthCredentials>({
    mutationFn: login,
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

  useEffect(() => {
    if (!isHydrated || !accessToken || user) return;

    // Результат кладётся в стор без оглядки на размонтирование: стор живёт
    // дольше компонента, а отмена оставляла бы приложение на спиннере — эффект
    // успевал отписаться раньше, чем приходил ответ, и профиль терялся.
    void getCurrentUser().then(setUser).catch(signOut);
  }, [isHydrated, accessToken, user, setUser, signOut]);
}
