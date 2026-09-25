import { Box, Flex, IconButton } from "@bolid-ui/themes";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Outlet } from "react-router";

import { AppSidebar } from "../components/app-sidebar";
import { SettingsDialog } from "../components/settings/settings-dialog";
import { SidebarInset, SidebarProvider } from "../components/ui/sidebar";
import { useIsMobile } from "../hooks/use-mobile";
import { useAuthStore } from "../stores/auth.store";

/** Меню на компьютере не сворачивается: это не нужно ни одной роли. */
const keepSidebarOpen = () => undefined;

export function AppLayout() {
  const user = useAuthStore((state) => state.user);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isMobile = useIsMobile();

  return (
    <Flex
      className="arm-shell h-screen-safe min-h-0 overflow-hidden"
      direction="column"
    >
      {user ? (
        <SidebarProvider
          className="min-h-0 flex-1"
          open
          onOpenChange={keepSidebarOpen}
          openMobile={sidebarMobileOpen}
          onOpenMobileChange={setSidebarMobileOpen}
        >
          <AppSidebar onOpenSettings={() => setSettingsOpen(true)} />
          {/* Фон страниц задаётся здесь один раз: страницы свой фон не красят,
              иначе при переходе между разделами он меняется. */}
          <SidebarInset className="arm-content h-full min-w-0 overflow-auto">
            {/* На телефоне меню — выезжающая панель, и без шапки открыть её
                больше нечем. */}
            {isMobile && (
              <IconButton
                aria-label="Открыть меню"
                className="fixed top-2 left-2 z-20"
                onClick={() => setSidebarMobileOpen(true)}
                type="button"
                variant="soft"
              >
                <Menu size={16} />
              </IconButton>
            )}
            <Outlet />
          </SidebarInset>
        </SidebarProvider>
      ) : (
        <Box className="arm-content min-h-0 flex-1 overflow-auto" role="main">
          <Outlet />
        </Box>
      )}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </Flex>
  );
}
