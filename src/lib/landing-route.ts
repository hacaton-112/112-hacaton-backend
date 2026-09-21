import type { UserRole } from "../contracts/auth";
import { ROUTES } from "../config/routes";

/** Обучающийся начинает с выданного занятия; служебные роли сохраняют прежний вход. */
export const landingRouteForRole = (role: UserRole): string =>
  role === "operator" ? ROUTES.assignments() : ROUTES.operator();
