import { Navigate, Outlet } from "react-router";

import type { UserRole } from "../contracts/auth";
import { useAuthStore } from "../stores/auth.store";

interface RoleLayoutProps {
  allowed: readonly UserRole[];
}

/** Client-side navigation guard; backend repeats the authoritative role check. */
export function RoleLayout({ allowed }: RoleLayoutProps) {
  const role = useAuthStore((state) => state.user?.role);

  return role && allowed.includes(role) ? (
    <Outlet />
  ) : (
    <Navigate to="/" replace />
  );
}
