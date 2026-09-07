import { Box, Flex, IconButton, Text, Tooltip } from "@bolid-ui/themes";
import { isTauri } from "@tauri-apps/api/core";
import { type Window, getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, RadioTower, Square, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

const APP_NAME = "Учебный симулятор службы 112";

type WindowAction = (window: Window) => Promise<void>;

function runWindowAction(window: Window | null, action: WindowAction) {
  if (!window) return;
  void action(window).catch(() => undefined);
}

export function WindowTitlebar() {
  // Вне Tauri (обычный `bun run dev` в браузере) окна нет — шапка остаётся
  // декоративной, а кнопки просто ничего не делают.
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
      className="h-rx-8 border-grayA-4 bg-background relative z-10 shrink-0 border-b select-none"
      data-slot="window-titlebar"
      data-tauri-drag-region
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        toggleMaximize();
      }}
    >
      <Flex
        align="center"
        gap="2"
        px="3"
        className="shrink-0"
        data-tauri-drag-region
      >
        <RadioTower
          aria-hidden="true"
          className="text-accent-9 pointer-events-none"
          size={14}
          strokeWidth={1.5}
        />
        <Text
          className="pointer-events-none"
          color="gray"
          highContrast
          size="1"
          weight="medium"
        >
          {APP_NAME}
        </Text>
      </Flex>
      <Box className="h-full min-w-0 flex-1" data-tauri-drag-region />
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
          onClick={() => runWindowAction(window, (current) => current.close())}
        >
          <X aria-hidden="true" size={14} strokeWidth={1.5} />
        </TitlebarButton>
      </Flex>
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
              ? "bg-background m-0! size-full! rounded-none! hover:bg-red-600! hover:text-white!"
              : "bg-background hover:bg-gray-2! m-0! size-full! rounded-none!"
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
