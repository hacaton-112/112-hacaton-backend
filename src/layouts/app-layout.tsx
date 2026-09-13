import { Box, Flex } from "@bolid-ui/themes";
import { useState } from "react";
import { Outlet } from "react-router";

import { AppSidebar } from "../components/app-sidebar";
import { SettingsDialog } from "../components/settings/settings-dialog";
import { SidebarInset, SidebarProvider } from "../components/ui/sidebar";
import { WindowTitlebar } from "../components/window/window-titlebar";
import { useIsMobile } from "../hooks/use-mobile";
import { useAuthStore } from "../stores/auth.store";

/** Окно без системных декораций: шапка и кнопки управления рисуются здесь. */
export function AppLayout() {
  const user = useAuthStore((state) => state.user);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isMobile = useIsMobile();

  return (
    <Flex className="h-screen-safe min-h-0 overflow-hidden" direction="column">
      <WindowTitlebar
        sidebarOpen={
          user ? (isMobile ? sidebarMobileOpen : sidebarOpen) : undefined
        }
        onToggleSidebar={
          user
            ? () =>
                isMobile
                  ? setSidebarMobileOpen((open) => !open)
                  : setSidebarOpen((open) => !open)
            : undefined
        }
      />
      {user ? (
        <SidebarProvider
          className="min-h-0 flex-1"
          open={sidebarOpen}
          onOpenChange={setSidebarOpen}
          openMobile={sidebarMobileOpen}
          onOpenMobileChange={setSidebarMobileOpen}
        >
          <AppSidebar onOpenSettings={() => setSettingsOpen(true)} />
          <SidebarInset className="border-grayA-4 h-full min-w-0 overflow-auto border-l">
            <Outlet />
          </SidebarInset>
        </SidebarProvider>
      ) : (
        <Box className="min-h-0 flex-1 overflow-auto" role="main">
          <Outlet />
        </Box>
      )}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </Flex>
  );
}
