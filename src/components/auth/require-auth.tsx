import { Flex, Spinner } from "@bolid-ui/themes";
import type { ReactNode } from "react";
import { Navigate } from "react-router";

import { useAuthSession } from "../../hooks/use-auth";
import { useAuthStore } from "../../stores/auth.store";

export function RequireAuth({ children }: { children: ReactNode }) {
  useAuthSession();
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const user = useAuthStore((state) => state.user);

  // A persisted refresh token is rotated before protected UI is shown.
  if (!isHydrated || (refreshToken && !user)) {
    return (
      <Flex align="center" justify="center" className="h-full">
        <Spinner size="3" />
      </Flex>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return children;
}
