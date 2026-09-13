import type { AppAccentColor, AppTheme } from "../services/settings.service";

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
