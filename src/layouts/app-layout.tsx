import { Box, Flex } from "@bolid-ui/themes";
import { Outlet } from "react-router";

import { WindowTitlebar } from "../components/window/window-titlebar";

/** Окно без системных декораций: шапка и кнопки управления рисуются здесь. */
export function AppLayout() {
  return (
    <Flex className="h-screen-safe min-h-0 overflow-hidden" direction="column">
      <WindowTitlebar />
      <Box className="min-h-0 flex-1 overflow-auto" role="main">
        <Outlet />
      </Box>
    </Flex>
  );
}
