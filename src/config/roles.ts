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

/** Отработка карточек ДДС доступна операторам, а также для проверки преподавателям и администраторам. */
export const DDS_TRAINEE_ROLES: readonly UserRole[] = [
  "operator",
  "instructor",
  "admin",
];

export const canTrainAsDds = (role?: UserRole): boolean =>
  role !== undefined && DDS_TRAINEE_ROLES.includes(role);

/** Создавать и вести учётные записи учеников (операторов) могут преподаватель и администратор. */
export const canCreateStudents = (role?: UserRole): boolean =>
  role === "instructor" || role === "admin";

export const canManageStudentAccount = (role?: UserRole): boolean =>
  role === "instructor" || role === "admin";

/** Учётные записи любых ролей (включая преподавателей) создаёт администратор. */
export const canCreateUsers = (role?: UserRole): boolean => role === "admin";

/** Кабинет администратора закрыт для преподавателей и операторов. */
export const ADMIN_ROLES: readonly UserRole[] = ["admin"];

export const canAdministerUsers = (role?: UserRole): boolean =>
  role !== undefined && ADMIN_ROLES.includes(role);
/** Преподаватель сверяет версию, администратор также импортирует и активирует. */
export const CLASSIFIER_VIEWER_ROLES: readonly UserRole[] = [
  "instructor",
  "admin",
];
export const canViewClassifier = (role?: UserRole): boolean =>
  role !== undefined && CLASSIFIER_VIEWER_ROLES.includes(role);
export const canManageClassifier = (role?: UserRole): boolean =>
  role === "admin";

/** Подписи ролей в интерфейсе. */
export const ROLE_LABELS: Record<UserRole, string> = {
  operator: "Оператор",
  instructor: "Преподаватель",
  admin: "Администратор",
};
