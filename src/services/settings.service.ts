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

export interface AppSettings {
  theme: AppTheme;
  accentColor: AppAccentColor;
  inputDevice: string | null;
  outputDevice: string | null;
}

const STORAGE_KEY = "trainer-112-settings";
const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  accentColor: "blue",
  inputDevice: null,
  outputDevice: null,
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
      inputDevice:
        typeof stored?.inputDevice === "string" ? stored.inputDevice : null,
      outputDevice:
        typeof stored?.outputDevice === "string" ? stored.outputDevice : null,
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
