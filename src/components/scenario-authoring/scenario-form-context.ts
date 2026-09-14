import { createContext, use } from "react";

/**
 * Помощник собирает черновик: разделы, заголовки и подписи остаются на местах,
 * а скелетоном становятся только сами поля — страница не прыгает.
 */
export const ScenarioFormLoadingContext = createContext(false);

/** Ошибки проверки перед публикацией по пути поля: `persona.code`, `facts.0.key`. */
export type ScenarioFieldErrors = ReadonlyMap<string, string>;

export const ScenarioFormErrorsContext = createContext<{
  errors: ScenarioFieldErrors;
  /** Поле правят — его ошибка и ошибки вложенных значений больше не нужны. */
  clear: (path: string) => void;
}>({ errors: new Map(), clear: () => undefined });

const isWithin = (issuePath: string, fieldPath: string) =>
  issuePath === fieldPath || issuePath.startsWith(`${fieldPath}.`);

/**
 * Ошибка поля. Список ключевых слов отвечает и за ошибку отдельного слова
 * (`facts.0.contentKeywords.2`), а `exact` — для мест, которые показывают
 * только собственную ошибку, как карта над полями широты и долготы.
 */
export function findFieldError(
  errors: ScenarioFieldErrors,
  path: string,
  exact = false,
): string | undefined {
  if (exact) return errors.get(path);

  for (const [issuePath, message] of errors) {
    if (isWithin(issuePath, path)) return message;
  }
  return undefined;
}

export function withoutFieldErrors(
  errors: ScenarioFieldErrors,
  path: string,
): ScenarioFieldErrors {
  const next = new Map(
    [...errors].filter(([issuePath]) => !isWithin(issuePath, path)),
  );
  return next.size === errors.size ? errors : next;
}

/** Показано ли где-то в форме поле, отвечающее за эту ошибку. */
export const isShownByField = (issuePath: string, fieldPaths: string[]) =>
  fieldPaths.some((fieldPath) => isWithin(issuePath, fieldPath));

interface ValidationIssue {
  code: string;
  path: PropertyKey[];
  message: string;
  origin?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  expected?: string;
}

const characters = (count: number) =>
  `${count} ${count === 1 ? "символа" : "символов"}`;

/**
 * Сообщения схемы написаны по-русски, а стандартные сообщения zod — нет:
 * их переводим по коду ошибки.
 */
export function describeIssue(issue: ValidationIssue): string {
  if (!/^(Too small|Too big|Invalid)/.test(issue.message)) return issue.message;

  const minimum = Number(issue.minimum ?? 0);
  const maximum = Number(issue.maximum ?? 0);

  switch (issue.code) {
    case "too_small":
      if (issue.origin === "string") {
        return minimum <= 1
          ? "Заполните поле"
          : `Не короче ${characters(minimum)}`;
      }
      if (issue.origin === "array") {
        return minimum <= 1
          ? "Добавьте хотя бы одно значение"
          : `Нужно не меньше ${minimum} значений`;
      }
      return `Не меньше ${minimum}`;
    case "too_big":
      if (issue.origin === "string") {
        return `Не длиннее ${characters(maximum)}`;
      }
      if (issue.origin === "array") return `Не больше ${maximum} значений`;
      return `Не больше ${maximum}`;
    case "invalid_type":
      return issue.expected === "number" ? "Введите число" : "Заполните поле";
    case "invalid_value":
    case "invalid_union":
      return "Выберите значение из списка";
    default:
      return "Неверное значение";
  }
}

/** Первая ошибка на каждое поле: две подписи под одним полем не нужны. */
export function fieldErrorsFrom(
  issues: ValidationIssue[],
): ScenarioFieldErrors {
  const errors = new Map<string, string>();
  for (const issue of issues) {
    const path = issue.path.map(String).join(".");
    if (!errors.has(path)) errors.set(path, describeIssue(issue));
  }
  return errors;
}

/**
 * Ошибка проверки для поля по его пути в сценарии. Правка поля сразу снимает
 * ошибку: преподаватель видит, что осталось исправить.
 */
export function useFieldError(path: string | undefined, exact = false) {
  const { errors, clear } = use(ScenarioFormErrorsContext);
  const error =
    path === undefined ? undefined : findFieldError(errors, path, exact);

  return {
    error,
    clear: () => {
      if (path !== undefined && error !== undefined) clear(path);
    },
    /** По этим атрибутам страница находит поле и прокручивает к первой ошибке. */
    anchor: {
      "data-field-path": path,
      "data-field-invalid": error === undefined ? undefined : "true",
    },
  };
}
