import { useSyncExternalStore } from "react";

export type AppTheme = "system" | "light" | "dark";
export type AppAccentColor =
  | "gray"
  | "blue"
  | "indigo"
  | "violet"
  | "cyan"
  | "teal"
  | "green"
  | "amber"
  | "orange"
  | "red"
  | "pink";
export type AppRadius = "none" | "small" | "medium" | "large" | "full";
export type AppScaling =
  "90%" | "95%" | "100%" | "105%" | "110%" | "120%" | "130%";

export interface AppSettings {
  theme: AppTheme;
  accentColor: AppAccentColor;
  radius: AppRadius;
  scaling: AppScaling;
  inputDevice: string | null;
  /** Громкость микрофона: 1 — 100 %, максимум 2. */
  inputGain: number;
  outputDevice: string | null;
  /** Громкость воспроизведения заявителя: 1 — 100 %, максимум 2. */
  outputVolume: number;
}

export const MAX_VOLUME = 2;

const STORAGE_KEY = "trainer-112-settings";
const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  accentColor: "blue",
  radius: "medium",
  scaling: "100%",
  inputDevice: null,
  inputGain: 1,
  outputDevice: null,
  outputVolume: 1,
};

const THEMES = new Set<AppTheme>(["system", "light", "dark"]);
const ACCENTS = new Set<AppAccentColor>([
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
]);
const RADII = new Set<AppRadius>(["none", "small", "medium", "large", "full"]);
const SCALINGS = new Set<AppScaling>([
  "90%",
  "95%",
  "100%",
  "105%",
  "110%",
  "120%",
  "130%",
]);

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
      inputGain: readVolume(stored?.inputGain, DEFAULT_SETTINGS.inputGain),
      outputDevice:
        typeof stored?.outputDevice === "string" ? stored.outputDevice : null,
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
