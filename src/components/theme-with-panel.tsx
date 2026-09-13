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

  return (
    <I18nProvider locale="ru-RU">
      <Theme
        appearance={
          settings.theme === "system" ? systemAppearance : settings.theme
        }
        accentColor={settings.accentColor}
        grayColor="gray"
        radius="medium"
      >
        <Toaster position="top-center" duration={6_000} />
        {children}
      </Theme>
    </I18nProvider>
  );
}
