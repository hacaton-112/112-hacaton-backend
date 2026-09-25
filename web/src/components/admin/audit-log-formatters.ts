export const AUDIT_ACTION_LABELS = {
  "auth.login.succeeded": "Успешный вход",
  "auth.login.failed": "Неудачная попытка входа",
  "auth.logout.succeeded": "Выход из системы",
  "auth.refresh.rotated": "Сессия обновлена",
  "auth.refresh.failed": "Ошибка обновления сессии",
  "auth.refresh.revoked": "Refresh-сессия отозвана",
  "auth.sessions.revoked": "Сессии пользователя отозваны",
  "user.created": "Пользователь создан",
  "user.updated": "Пользователь изменён",
  "user.blocked": "Пользователь заблокирован",
  "user.unblocked": "Пользователь разблокирован",
  "user.role_changed": "Роль пользователя изменена",
  "user.password_changed": "Пароль пользователя изменён",
  "training.certificate.issued": "Сертификат выдан",
  "training.group.created": "Учебная группа создана",
  "training.group.updated": "Учебная группа изменена",
  "training.group.deleted": "Учебная группа удалена",
  "training.group.member_added": "Участник добавлен в группу",
  "training.group.member_updated": "Участник группы изменён",
  "training.group.member_removed": "Участник удалён из группы",
  "training.assignment.created": "Назначение создано",
  "training.assignment.updated": "Назначение изменено",
  "training.assignment.deleted": "Назначение удалено",
  "training.assignment.launched": "Назначение запущено",
  "training.assignment.completed": "Назначение завершено",
  "training.assignment.archived": "Назначение архивировано",
  "training.session.ended_by_instructor": "Сессия завершена преподавателем",
  "dds.lesson.started": "Занятие ДДС начато",
  "dds.lesson.finished": "Занятие ДДС завершено",
  "dds.review.created": "Оценка ДДС выставлена",
  "dds.attempt.stopped": "Попытка ДДС остановлена",
  "instructor.report.exported": "Отчёт преподавателя выгружен",
  "scenario.publish": "Сценарий опубликован",
  "scenario.archive": "Сценарий архивирован",
  "scenario.dialogue.create": "Диалог сценария создан",
  "scenario.dialogue.publish": "Диалог сценария опубликован",
  "scenario.audio.prepare": "Подготовка аудио запущена",
  "classifier.version.imported": "Классификатор загружен",
  "classifier.version.activated": "Классификатор активирован",
  "methodical-material.created": "Методический материал создан",
  "methodical-material.updated": "Методический материал изменён",
  "admin.workstations.import_validated": "Конфигурация рабочих мест проверена",
  "admin.workstations.imported": "Конфигурация рабочих мест загружена",
} as const satisfies Record<string, string>;

export const AUDIT_ACTION_OPTIONS = Object.entries(AUDIT_ACTION_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export const auditActionLabel = (action: string): string =>
  AUDIT_ACTION_LABELS[action as keyof typeof AUDIT_ACTION_LABELS] ??
  "Системное действие";

export const AUDIT_RESOURCE_LABELS: Record<string, string> = {
  "auth-session": "Сессия",
  user: "Пользователь",
  "training-assignment": "Учебное назначение",
  "training-group": "Учебная группа",
  "training-session": "Учебная сессия",
  "dds-lesson": "Занятие ДДС",
  "dds-exercise": "Карточка ДДС",
  scenario: "Сценарий",
  "scenario-version": "Версия сценария",
  scenario_version: "Версия сценария",
  dialogue_preparation: "Подготовка диалога",
  classifier_version: "Версия классификатора",
  "methodical-material": "Методический материал",
  instructor_report: "Отчёт преподавателя",
  telephony_workstations: "Рабочие места телефонии",
};

export const AUDIT_RESOURCE_OPTIONS = Object.entries(AUDIT_RESOURCE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export const auditResourceLabel = (resource: string): string =>
  AUDIT_RESOURCE_LABELS[resource] ?? "Системный объект";
