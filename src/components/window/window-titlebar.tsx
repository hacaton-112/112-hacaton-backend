import { Box, Flex, IconButton, Text, Tooltip } from "@bolid-ui/themes";
import { PanelLeftClose, PanelLeftOpen, RadioTower } from "lucide-react";

const APP_NAME = "Учебный симулятор службы 112";

export function WindowTitlebar({
  onToggleSidebar,
  sidebarOpen,
  title = APP_NAME,
}: {
  closeBehavior?: "close" | "hide";
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
  title?: string;
}) {
  return (
    <Flex
      align="center"
      className="arm-titlebar h-rx-8 relative z-10 shrink-0 select-none"
      data-slot="window-titlebar"
    >
      {onToggleSidebar && (
        <Box className="h-full w-[calc(46px*var(--scaling))] shrink-0">
          <Tooltip content={sidebarOpen ? "Свернуть меню" : "Развернуть меню"}>
            <IconButton
              aria-label={sidebarOpen ? "Свернуть меню" : "Развернуть меню"}
              className="arm-window-control m-0! size-full! rounded-none!"
              highContrast
              onClick={onToggleSidebar}
              type="button"
              variant="soft"
            >
              {sidebarOpen ? (
                <PanelLeftClose size={14} />
              ) : (
                <PanelLeftOpen size={14} />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      )}
      <Flex align="center" gap="2" px="3" className="shrink-0">
        <RadioTower
          aria-hidden="true"
          className="arm-titlebar-mark"
          size={14}
          strokeWidth={1.5}
        />
        <Text className="arm-titlebar-text" size="1" weight="medium">
          {title}
        </Text>
      </Flex>
      <Box className="h-full min-w-0 flex-1" />
    </Flex>
  );
}
