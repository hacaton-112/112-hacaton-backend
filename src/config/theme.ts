import type {
  AppAccentColor,
  AppRadius,
  AppScaling,
  AppTheme,
} from "../services/settings.service";

export const THEME_PREFERENCES: AppTheme[] = ["system", "light", "dark"];

export const THEME_LABELS: Record<AppTheme, string> = {
  system: "Системная",
  light: "Светлая",
  dark: "Тёмная",
};

export const ACCENT_COLORS: AppAccentColor[] = [
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
];

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

export const RADIUS_OPTIONS: AppRadius[] = [
  "none",
  "small",
  "medium",
  "large",
  "full",
];

export const RADIUS_LABELS: Record<AppRadius, string> = {
  none: "Без скругления",
  small: "Малое",
  medium: "Среднее",
  large: "Большое",
  full: "Полное",
};

export const SCALING_OPTIONS: AppScaling[] = [
  "90%",
  "95%",
  "100%",
  "105%",
  "110%",
  "120%",
  "130%",
];
