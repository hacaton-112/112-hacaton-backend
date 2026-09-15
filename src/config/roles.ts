import type { UserRole } from "../contracts/auth";

/**
 * Кто ведёт учебные сценарии.
 *
 * Один список на защиту маршрута и на пункт меню: пока он был написан дважды,
 * добавление роли показывало бы раздел в боковой панели, а переход в него
 * отбрасывало бы обратно на рабочее место.
 */
export const SCENARIO_AUTHOR_ROLES: readonly UserRole[] = [
  "instructor",
  "admin",
];

export const canAuthorScenarios = (role?: UserRole): boolean =>
  role !== undefined && SCENARIO_AUTHOR_ROLES.includes(role);

/** Подписи ролей в интерфейсе. */
export const ROLE_LABELS: Record<UserRole, string> = {
  operator: "Оператор",
  instructor: "Преподаватель",
  admin: "Администратор",
};
