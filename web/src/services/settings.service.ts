import { useSyncExternalStore } from "react";

import {
  ACCENT_COLORS,
  RADIUS_OPTIONS,
  SCALING_OPTIONS,
  THEME_PREFERENCES,
  type AppAccentColor,
  type AppRadius,
  type AppScaling,
  type AppTheme,
} from "../config/theme";

export type {
  AppAccentColor,
  AppRadius,
  AppScaling,
  AppTheme,
} from "../config/theme";

export interface AppSettings {
  theme: AppTheme;
  accentColor: AppAccentColor;
  radius: AppRadius;
  scaling: AppScaling;
  inputDevice: string | null;
  /**
   * Название выбранного микрофона. Браузер меняет идентификаторы устройств
   * (очистка данных сайта, сайт с непостоянным разрешением), а название
   * остаётся: по нему выбранное устройство находится снова.
   */
  inputDeviceLabel: string | null;
  /** Громкость микрофона: 1 — 100 %, максимум 2. */
  inputGain: number;
  outputDevice: string | null;
  outputDeviceLabel: string | null;
  /** Громкость воспроизведения заявителя: 1 — 100 %, максимум 2. */
  outputVolume: number;
}

export const MAX_VOLUME = 2;

const STORAGE_KEY = "trainer-112-settings";
const DEFAULT_SETTINGS: AppSettings = {
  theme: "light",
  accentColor: "orange",
  radius: "none",
  scaling: "100%",
  inputDevice: null,
  inputDeviceLabel: null,
  inputGain: 1,
  outputDevice: null,
  outputDeviceLabel: null,
  outputVolume: 1,
};

// Наборы для проверки прочитанного из localStorage: значения берутся из того
// же списка, который рисует настройки, — разойтись они уже не могут.
const THEMES = new Set<string>(THEME_PREFERENCES);
const ACCENTS = new Set<string>(ACCENT_COLORS);
const RADII = new Set<string>(RADIUS_OPTIONS);
const SCALINGS = new Set<string>(SCALING_OPTIONS);

function readVolume(value: unknown, fallback: number): number {
  return typeof value === "number" && value >= 0 && value <= MAX_VOLUME
    ? value
    : fallback;
}

function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const stored = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "null",
    ) as Partial<AppSettings> | null;
    return {
      theme:
        stored?.theme && THEMES.has(stored.theme)
          ? stored.theme
          : DEFAULT_SETTINGS.theme,
      accentColor:
        stored?.accentColor && ACCENTS.has(stored.accentColor)
          ? stored.accentColor
          : DEFAULT_SETTINGS.accentColor,
      radius:
        stored?.radius && RADII.has(stored.radius)
          ? stored.radius
          : DEFAULT_SETTINGS.radius,
      scaling:
        stored?.scaling && SCALINGS.has(stored.scaling)
          ? stored.scaling
          : DEFAULT_SETTINGS.scaling,
      inputDevice:
        typeof stored?.inputDevice === "string" ? stored.inputDevice : null,
      inputDeviceLabel:
        typeof stored?.inputDeviceLabel === "string"
          ? stored.inputDeviceLabel
          : null,
      inputGain: readVolume(stored?.inputGain, DEFAULT_SETTINGS.inputGain),
      outputDevice:
        typeof stored?.outputDevice === "string" ? stored.outputDevice : null,
      outputDeviceLabel:
        typeof stored?.outputDeviceLabel === "string"
          ? stored.outputDeviceLabel
          : null,
      outputVolume: readVolume(
        stored?.outputVolume,
        DEFAULT_SETTINGS.outputVolume,
      ),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

let current = loadSettings();
const listeners = new Set<() => void>();

export const settingsService = {
  get(): AppSettings {
    return current;
  },

  update(patch: Partial<AppSettings>): void {
    current = { ...current, ...patch };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    listeners.forEach((listener) => listener());
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useSettings(): AppSettings {
  return useSyncExternalStore(
    settingsService.subscribe,
    settingsService.get,
    settingsService.get,
  );
}
