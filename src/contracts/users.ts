import type { UserRole } from "./auth";

/** Учётную запись создаёт администратор (ТЗ, стр. 9): публичной регистрации нет. */
export interface CreateUser {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
}

/** Правка учётной записи: передаются только изменённые поля. */
export type UpdateUser = Partial<CreateUser>;

/** Те же правила, что у backend: иначе ошибка приходила бы только после отправки. */
export const passwordProblem = (password: string): string | null => {
  if (password.length < 8) return "Пароль — не короче 8 символов";
  if (!/[A-Za-z]/.test(password)) return "В пароле нужна латинская буква";
  if (!/\d/.test(password)) return "В пароле нужна цифра";
  return null;
};
