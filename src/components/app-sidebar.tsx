import {
  Activity,
  BookOpen,
  LibraryBig,
  ClipboardList,
  FileSpreadsheet,
  Headphones,
  GraduationCap,
  RadioTower,
  LogOut,
  Settings,
  UserRound,
  Users,
  ShieldCheck,
} from "lucide-react";
import { Button, Grid, Popover, Text } from "@bolid-ui/themes";
import type { LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";

import { useAuthLogout } from "../hooks/use-auth";
import {
  ROLE_LABELS,
  canAuthorScenarios,
  canViewClassifier,
  canManageTraining,
  canTrainAsDds,
  canAdministerUsers,
} from "../config/roles";
import { ROUTES } from "../config/routes";
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

export function AppSidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthLogout();
  const { setOpenMobile } = useSidebar();
  const [accountOpen, setAccountOpen] = useState(false);
  const showDds = canTrainAsDds(user?.role);
  const showScenarios = canAuthorScenarios(user?.role);

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
                active={location.pathname === ROUTES.operator()}
                icon={Headphones}
                label="Рабочее место"
                onClick={() => goTo(ROUTES.operator())}
              >
                Рабочее место
              </SidebarNavItem>
              <SidebarNavItem
                active={location.pathname.startsWith(ROUTES.debrief())}
                icon={ClipboardList}
                label="Разбор звонков"
                onClick={() => goTo(ROUTES.debrief())}
              >
                Разбор звонков
              </SidebarNavItem>
              <SidebarNavItem
                active={location.pathname.startsWith(
                  ROUTES.methodicalMaterials(),
                )}
                icon={LibraryBig}
                label="Методические материалы"
                onClick={() => goTo(ROUTES.methodicalMaterials())}
              >
                Методические материалы
              </SidebarNavItem>
              {canManageTraining(user?.role) ? (
                <>
                  <SidebarNavItem
                    active={location.pathname.startsWith(ROUTES.monitoring())}
                    icon={Activity}
                    label="Мониторинг"
                    onClick={() => goTo(ROUTES.monitoring())}
                  >
                    Мониторинг
                  </SidebarNavItem>
                  <SidebarNavItem
                    active={location.pathname.startsWith(ROUTES.groups())}
                    icon={Users}
                    label="Группы"
                    onClick={() => goTo(ROUTES.groups())}
                  >
                    Группы
                  </SidebarNavItem>
                  <SidebarNavItem
                    active={location.pathname.startsWith(ROUTES.students())}
                    icon={GraduationCap}
                    label="Ученики"
                    onClick={() => goTo(ROUTES.students())}
                  >
                    Ученики
                  </SidebarNavItem>
                </>
              ) : (
                <SidebarNavItem
                  active={location.pathname.startsWith(ROUTES.assignments())}
                  icon={GraduationCap}
                  label="Мои назначения"
                  onClick={() => goTo(ROUTES.assignments())}
                >
                  Мои назначения
                </SidebarNavItem>
              )}
              {showDds && (
                <SidebarNavItem
                  active={location.pathname.startsWith(ROUTES.dds())}
                  icon={RadioTower}
                  label="Карточки ДДС"
                  onClick={() => goTo(ROUTES.dds())}
                >
                  Карточки ДДС
                </SidebarNavItem>
              )}
              {showScenarios && (
                <SidebarNavItem
                  active={location.pathname.startsWith(ROUTES.scenarios())}
                  icon={BookOpen}
                  label="Учебные сценарии"
                  onClick={() => goTo(ROUTES.scenarios())}
                >
                  Учебные сценарии
                </SidebarNavItem>
              )}
              {canAdministerUsers(user?.role) && (
                <SidebarNavItem
                  active={location.pathname.startsWith(ROUTES.admin())}
                  icon={ShieldCheck}
                  label="Администрирование"
                  onClick={() => goTo(ROUTES.admin())}
                >
                  Администрирование
                </SidebarNavItem>
              )}
              {canViewClassifier(user?.role) && (
                <SidebarNavItem
                  active={location.pathname.startsWith(ROUTES.classifier())}
                  icon={FileSpreadsheet}
                  label="Классификатор"
                  onClick={() => goTo(ROUTES.classifier())}
                >
                  Классификатор
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
            <Popover.Root open={accountOpen} onOpenChange={setAccountOpen}>
              <SidebarMenuButton
                asChild
                isActive={accountOpen}
                className="overflow-hidden"
                tooltip={user?.fullName ?? "Аккаунт"}
              >
                {/* Popover.Trigger в bolid всегда вешается на дочерний элемент,
                    поэтому обработчики доходят до самой кнопки: сам
                    SidebarMenuButton лишние пропсы не пробрасывает. */}
                <Popover.Trigger>
                  <button type="button" aria-label="Аккаунт">
                    <UserRound />
                    <span className="font-medium">{user?.fullName}</span>
                  </button>
                </Popover.Trigger>
              </SidebarMenuButton>
              <Popover.Content
                side="right"
                align="end"
                sideOffset={16}
                size="2"
                minWidth="240px"
              >
                <Grid gap="3">
                  <Grid gap="1">
                    <Text size="2" weight="bold" truncate>
                      {user?.fullName ?? "Пользователь"}
                    </Text>
                    {user?.role && (
                      <Text size="1" color="gray">
                        {ROLE_LABELS[user.role]}
                      </Text>
                    )}
                  </Grid>
                  <Button
                    type="button"
                    variant="soft"
                    color="gray"
                    className="justify-start"
                    onClick={() => {
                      setAccountOpen(false);
                      setOpenMobile(false);
                      onOpenSettings();
                    }}
                  >
                    <Settings size={16} /> Настройки
                  </Button>
                </Grid>
              </Popover.Content>
            </Popover.Root>
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
