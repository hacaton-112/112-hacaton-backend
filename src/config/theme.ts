/**
 * Единственный список допустимых значений оформления.
 *
 * Типы выводятся из этих же массивов, а `settings.service` валидирует
 * сохранённые настройки по ним: раньше каждый список существовал дважды и мог
 * разойтись.
 */
export const THEME_PREFERENCES = ["system", "light", "dark"] as const;

export const THEME_LABELS: Record<AppTheme, string> = {
  system: "Системная",
  light: "Светлая",
  dark: "Тёмная",
};

export const ACCENT_COLORS = [
  "gray",
  "blue",
  "indigo",
  "violet",
  "cyan",
  "teal",
  "green",
  "amber",
  "orange",
  "red",
  "pink",
] as const;

export const ACCENT_LABELS: Record<AppAccentColor, string> = {
  gray: "Серый",
  blue: "Синий",
  indigo: "Индиго",
  violet: "Фиолетовый",
  cyan: "Голубой",
  teal: "Бирюзовый",
  green: "Зелёный",
  amber: "Янтарный",
  orange: "Оранжевый",
  red: "Красный",
  pink: "Розовый",
};

export const RADIUS_OPTIONS = [
  "none",
  "small",
  "medium",
  "large",
  "full",
] as const;

export const RADIUS_LABELS: Record<AppRadius, string> = {
  none: "Без скругления",
  small: "Малое",
  medium: "Среднее",
  large: "Большое",
  full: "Полное",
};

export const SCALING_OPTIONS = [
  "90%",
  "95%",
  "100%",
  "105%",
  "110%",
  "120%",
  "130%",
] as const;

export type AppTheme = (typeof THEME_PREFERENCES)[number];
export type AppAccentColor = (typeof ACCENT_COLORS)[number];
export type AppRadius = (typeof RADIUS_OPTIONS)[number];
export type AppScaling = (typeof SCALING_OPTIONS)[number];
