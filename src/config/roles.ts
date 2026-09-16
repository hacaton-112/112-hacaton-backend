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

/** Кто ведёт группы и занятия; обучающийся видит только свои назначения. */
export const TRAINING_MANAGER_ROLES: readonly UserRole[] = [
  "instructor",
  "admin",
];
export const TRAINEE_ROLES: readonly UserRole[] = ["operator"];

export const canManageTraining = (role?: UserRole): boolean =>
  role !== undefined && TRAINING_MANAGER_ROLES.includes(role);

/** Карточки ДДС сейчас предназначены только для обучающихся-операторов. */
export const DDS_TRAINEE_ROLES: readonly UserRole[] = TRAINEE_ROLES;

export const canTrainAsDds = (role?: UserRole): boolean =>
  role !== undefined && DDS_TRAINEE_ROLES.includes(role);

/** Учётные записи создаёт только администратор (ТЗ, стр. 9). */
export const canCreateUsers = (role?: UserRole): boolean => role === "admin";

/** Подписи ролей в интерфейсе. */
export const ROLE_LABELS: Record<UserRole, string> = {
  operator: "Оператор",
  instructor: "Преподаватель",
  admin: "Администратор",
};
