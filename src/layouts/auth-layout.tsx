import { Flex, Spinner } from "@bolid-ui/themes";
import { Navigate, Outlet } from "react-router";

import { useAuthSession } from "../hooks/use-auth";
import { useAuthStore } from "../stores/auth.store";

/** Восстанавливает сессию и пропускает к вложенным маршрутам только авторизованного пользователя. */
export function AuthLayout() {
  useAuthSession();
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const user = useAuthStore((state) => state.user);

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

  return <Outlet />;
}
