import {
  I18nProvider,
  IconButton,
  Theme,
  ThemePanel,
  Toaster,
} from "@bolid-ui/themes";
import { PaletteIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

export function ThemeWithPanel({ children }: { children: ReactNode }) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  return (
    <I18nProvider locale="ru-RU">
      <Theme
        appearance="light"
        accentColor="blue"
        grayColor="gray"
        radius="medium"
      >
        <IconButton
          size="2"
          radius="full"
          variant="solid"
          color="blue"
          highContrast
          aria-label="Настройки темы"
          title="Настройки темы"
          onClick={() => setIsPanelOpen((open) => !open)}
          className="fixed right-4 bottom-4 z-[10000] shadow-lg ring-2 ring-white/80"
        >
          <PaletteIcon size={16} />
        </IconButton>
        <ThemePanel open={isPanelOpen} onOpenChange={setIsPanelOpen} />
        <Toaster position="top-center" duration={6_000} />
        {children}
      </Theme>
    </I18nProvider>
  );
}
