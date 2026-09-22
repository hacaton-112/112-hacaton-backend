import { Box, Flex, IconButton, Text, Tooltip } from "@bolid-ui/themes";
import { isTauri } from "@tauri-apps/api/core";
import { type Window, getCurrentWindow } from "@tauri-apps/api/window";
import {
  Copy,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  RadioTower,
  Square,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

const APP_NAME = "Учебный симулятор службы 112";

type WindowAction = (window: Window) => Promise<void>;

function runWindowAction(window: Window | null, action: WindowAction) {
  if (!window) return;
  void action(window).catch(() => undefined);
}

export function WindowTitlebar({
  closeBehavior = "close",
  onToggleSidebar,
  sidebarOpen,
  title = APP_NAME,
}: {
  closeBehavior?: "close" | "hide";
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
  title?: string;
}) {
  // В браузере системным окном управляет сам браузер. Не показываем элементы,
  // которые там заведомо ничего не делают и выглядят как сломанные кнопки.
  const window = useMemo(() => (isTauri() ? getCurrentWindow() : null), []);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!window) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;
    const updateMaximized = () => {
      void window
        .isMaximized()
        .then((value) => {
          if (!disposed) setMaximized(value);
        })
        .catch(() => undefined);
    };

    updateMaximized();
    void window
      .onResized(updateMaximized)
      .then((stopListening) => {
        if (disposed) stopListening();
        else unlisten = stopListening;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [window]);

  const toggleMaximize = () => {
    if (!window) return;
    void window
      .toggleMaximize()
      .then(() => window.isMaximized())
      .then(setMaximized)
      .catch(() => undefined);
  };

  return (
    <Flex
      align="center"
      className="arm-titlebar h-rx-8 relative z-10 shrink-0 select-none"
      data-slot="window-titlebar"
      data-tauri-drag-region
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        toggleMaximize();
      }}
    >
      {onToggleSidebar && (
        <TitlebarButton
          label={sidebarOpen ? "Свернуть меню" : "Развернуть меню"}
          onClick={onToggleSidebar}
        >
          {sidebarOpen ? (
            <PanelLeftClose aria-hidden="true" size={14} strokeWidth={1.5} />
          ) : (
            <PanelLeftOpen aria-hidden="true" size={14} strokeWidth={1.5} />
          )}
        </TitlebarButton>
      )}
      <Flex
        align="center"
        gap="2"
        px="3"
        className="shrink-0"
        data-tauri-drag-region
      >
        <RadioTower
          aria-hidden="true"
          className="arm-titlebar-mark pointer-events-none"
          size={14}
          strokeWidth={1.5}
        />
        <Text
          className="arm-titlebar-text pointer-events-none"
          size="1"
          weight="medium"
        >
          {title}
        </Text>
      </Flex>
      <Box className="h-full min-w-0 flex-1" data-tauri-drag-region />
      {window && (
        <Flex align="stretch" className="shrink-0" height="100%">
          <TitlebarButton
            label="Свернуть"
            onClick={() =>
              runWindowAction(window, (current) => current.minimize())
            }
          >
            <Minus aria-hidden="true" size={14} strokeWidth={1.5} />
          </TitlebarButton>
          <TitlebarButton
            label={maximized ? "Восстановить" : "Развернуть"}
            onClick={toggleMaximize}
          >
            {maximized ? (
              <Copy aria-hidden="true" size={12} strokeWidth={1.5} />
            ) : (
              <Square aria-hidden="true" size={12} strokeWidth={1.5} />
            )}
          </TitlebarButton>
          <TitlebarButton
            close
            label="Закрыть"
            onClick={() =>
              runWindowAction(window, (current) =>
                closeBehavior === "hide" ? current.hide() : current.close(),
              )
            }
          >
            <X aria-hidden="true" size={14} strokeWidth={1.5} />
          </TitlebarButton>
        </Flex>
      )}
    </Flex>
  );
}

function TitlebarButton({
  children,
  close = false,
  label,
  onClick,
}: {
  children: ReactNode;
  close?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Box
      className="h-full w-[calc(46px*var(--scaling))] shrink-0"
      data-close={close}
      data-slot="window-control"
    >
      <Tooltip content={label}>
        <IconButton
          aria-label={label}
          className={
            close
              ? "arm-window-control arm-window-control-close m-0! size-full! rounded-none!"
              : "arm-window-control m-0! size-full! rounded-none!"
          }
          highContrast
          onClick={onClick}
          type="button"
          variant="soft"
        >
          {children}
        </IconButton>
      </Tooltip>
    </Box>
  );
}
