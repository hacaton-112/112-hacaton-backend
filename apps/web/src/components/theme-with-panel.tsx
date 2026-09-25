import { I18nProvider, Theme, Toaster } from "@bolid-ui/themes";
import { useEffect, type CSSProperties, type ReactNode } from "react";

import { scalingFactor } from "../config/theme";
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
        // Тема знает только свои шаги масштаба, а рабочие места бывают и на
        // маленьких мониторах: множитель ставится переменной напрямую.
        scaling="100%"
        style={
          { "--scaling": scalingFactor(settings.scaling) } as CSSProperties
        }
      >
        <Toaster position="top-center" duration={6_000} />
        {children}
      </Theme>
    </I18nProvider>
  );
}
