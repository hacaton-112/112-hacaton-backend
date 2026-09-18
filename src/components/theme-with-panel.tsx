import { I18nProvider, Theme, Toaster } from "@bolid-ui/themes";
import { type ReactNode, useEffect } from "react";

import { useSettings } from "../services/settings.service";

export function ThemeWithPanel({ children }: { children: ReactNode }) {
  const settings = useSettings();

  // Оперативные рабочие места используют фиксированную светлую палитру
  // референсной Системы-112. Пользовательский масштаб сохраняется: он нужен
  // для разных размеров мониторов и не меняет визуальный язык приложения.
  useEffect(() => {
    document.documentElement.setAttribute(
      "data-data-table-theme-mode",
      "light",
    );
    document.documentElement.setAttribute("data-arm-theme", "reference");
  }, []);

  return (
    <I18nProvider locale="ru-RU">
      <Theme
        appearance="light"
        accentColor="orange"
        className="reference-theme"
        grayColor="gray"
        radius="none"
        scaling={settings.scaling}
      >
        <Toaster position="top-center" duration={6_000} />
        {children}
      </Theme>
    </I18nProvider>
  );
}
