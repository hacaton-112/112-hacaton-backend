import { I18nProvider, Theme, Toaster } from "@bolid-ui/themes";
import { type ReactNode, useEffect, useState } from "react";

import { useSettings } from "../services/settings.service";

export function ThemeWithPanel({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const [systemAppearance, setSystemAppearance] = useState<"light" | "dark">(
    () =>
      window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemAppearance(media.matches ? "dark" : "light");
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const appearance =
    settings.theme === "system" ? systemAppearance : settings.theme;

  // Тема таблиц Bolid задана отдельно для светлого и тёмного режима и выбирает
  // его по этому атрибуту. Без него таблица остаётся на базовых белых цветах
  // даже в тёмной теме приложения.
  useEffect(() => {
    document.documentElement.setAttribute(
      "data-data-table-theme-mode",
      appearance,
    );
  }, [appearance]);

  return (
    <I18nProvider locale="ru-RU">
      <Theme
        appearance={appearance}
        accentColor={settings.accentColor}
        grayColor="gray"
        radius={settings.radius}
        scaling={settings.scaling}
      >
        <Toaster position="top-center" duration={6_000} />
        {children}
      </Theme>
    </I18nProvider>
  );
}
