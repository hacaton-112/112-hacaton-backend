import { IconButton, Theme, ThemePanel } from "@bolid-ui/themes";
import { PaletteIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

export function ThemeWithPanel({ children }: { children: ReactNode }) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  return (
    <Theme appearance="dark" accentColor="red" grayColor="gray" radius="medium">
      <IconButton
        variant="soft"
        color="gray"
        aria-label="Настройки темы"
        onClick={() => setIsPanelOpen((open) => !open)}
        className="fixed right-4 bottom-10 z-50"
      >
        <PaletteIcon size={16} />
      </IconButton>
      {/* ThemePanel вешает на document горячие клавиши T и D, поэтому монтируем
          его только на время показа — иначе они перехватывают ввод всегда. */}
      {isPanelOpen && <ThemePanel />}
      {children}
    </Theme>
  );
}
