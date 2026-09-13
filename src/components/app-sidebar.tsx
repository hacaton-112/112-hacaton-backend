import {
  ClipboardList,
  FilePlus2,
  Headphones,
  LogOut,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";

import { useAuthLogout } from "../hooks/use-auth";
import { useAuthStore } from "../stores/auth.store";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "./ui/sidebar";

type NavItemProps = {
  active?: boolean;
  children: ReactNode;
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
};

function SidebarNavItem({
  active = false,
  children,
  disabled = false,
  icon: Icon,
  label,
  onClick,
}: NavItemProps) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        disabled={disabled}
        isActive={active}
        tooltip={label}
      >
        <button disabled={disabled} onClick={onClick} type="button">
          <Icon />
          <span>{children}</span>
        </button>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthLogout();
  const { setOpenMobile } = useSidebar();
  const canAuthorScenarios =
    user?.role === "instructor" || user?.role === "admin";

  const goTo = (path: string) => {
    navigate(path);
    setOpenMobile(false);
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-0!">
        <div className="h-rx-12 relative w-full overflow-hidden select-none">
          <img
            alt=""
            aria-hidden="true"
            className="left-rx-2 size-rx-9! group-data-[collapsible=icon]:left-rx-1_5 absolute top-1/2 max-w-none -translate-y-1/2 object-contain transition-[left] duration-(--app-transition-duration-base) ease-linear"
            src="/logo.png"
          />
          <span className="absolute top-1/2 left-[calc(52px*var(--scaling))] -translate-y-1/2 text-sm font-semibold whitespace-nowrap">
            Тренажёр 112
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarNavItem
                active={location.pathname === "/"}
                icon={Headphones}
                label="Рабочее место"
                onClick={() => goTo("/")}
              >
                Рабочее место
              </SidebarNavItem>
              <SidebarNavItem
                active={location.pathname.startsWith("/debrief")}
                icon={ClipboardList}
                label="Разбор звонков"
                onClick={() => goTo("/debrief")}
              >
                Разбор звонков
              </SidebarNavItem>
              {canAuthorScenarios && (
                <SidebarNavItem
                  active={location.pathname.startsWith("/scenarios")}
                  icon={FilePlus2}
                  label="Конструктор"
                  onClick={() => goTo("/scenarios/new")}
                >
                  Конструктор
                </SidebarNavItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="cursor-default overflow-hidden"
              tooltip={user?.fullName ?? "Профиль"}
            >
              <div>
                <UserRound />
                <span className="font-medium">{user?.fullName}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarNavItem
            disabled={logout.isPending}
            icon={LogOut}
            label="Выйти"
            onClick={() => logout.mutate()}
          >
            {logout.isPending ? "Выход…" : "Выйти"}
          </SidebarNavItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
