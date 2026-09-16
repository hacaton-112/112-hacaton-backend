import { DataTableReact } from "@bolid-ui/data-table";
import type {
  ColDef,
  ICellRendererParams,
} from "@bolid-ui/data-table/community";
import {
  Badge,
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Select,
  Skeleton,
  Text,
  TextField,
} from "@bolid-ui/themes";
import {
  AlertTriangle,
  Pencil,
  Power,
  PowerOff,
  Search,
  UserPlus,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { UserFormDialog } from "../../components/admin/user-form-dialog";
import { UserStatusDialog } from "../../components/admin/user-status-dialog";
import { formatDateTime } from "../../components/training/training-labels";
import { ROLE_LABELS } from "../../config/roles";
import type { AuthUser, UserRole } from "../../contracts/auth";
import type { UserListFilters, UserStatus } from "../../contracts/users";
import { useAdminUsers, useUserMutations } from "../../hooks/use-users";
import { ACTION_COLUMN, DATA_TABLE_DEFAULTS } from "../../lib/data-table";
import { useAuthStore } from "../../stores/auth.store";

const ALL = "all";

const ROLE_BADGE_COLORS = {
  operator: "blue",
  instructor: "orange",
  admin: "purple",
} as const satisfies Record<UserRole, string>;

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card size="2" variant="surface">
      <Text as="p" size="1" color="gray">
        {label}
      </Text>
      <Heading as="h3" size="6" mt="1">
        {value}
      </Heading>
    </Card>
  );
}

/** Кабинет администратора: доступ, роли и жизненный цикл учётных записей. */
export default function AdminPage() {
  const currentUserId = useAuthStore((state) => state.user?.id) ?? "";
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [role, setRole] = useState<UserRole | typeof ALL>(ALL);
  const [status, setStatus] = useState<UserStatus | typeof ALL>(ALL);
  const [formOpen, setFormOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<AuthUser>();
  const [userToToggle, setUserToToggle] = useState<AuthUser>();
  const mutations = useUserMutations();
  const filters = useMemo<UserListFilters>(
    () => ({
      ...(role !== ALL && { role }),
      ...(status !== ALL && { status }),
      ...(deferredSearch !== "" && { search: deferredSearch }),
    }),
    [deferredSearch, role, status],
  );
  const allUsers = useAdminUsers();
  const users = useAdminUsers(filters);

  const edit = (user: AuthUser) => {
    mutations.update.reset();
    setUserToEdit(user);
    setFormOpen(true);
  };

  const changeStatus = (user: AuthUser) => {
    mutations.update.reset();
    setUserToToggle(user);
  };

  const columnDefs: ColDef<AuthUser>[] = [
    {
      field: "fullName",
      headerName: "Пользователь",
      flex: 2,
      minWidth: 220,
      cellRenderer: ({ data }: ICellRendererParams<AuthUser>) =>
        data ? (
          <Flex align="center" gap="2" className="h-full">
            <Text weight="medium">{data.fullName}</Text>
            {data.id === currentUserId && (
              <Badge color="gray" variant="soft">
                Вы
              </Badge>
            )}
          </Flex>
        ) : null,
    },
    { field: "email", headerName: "Email", flex: 2, minWidth: 220 },
    {
      field: "role",
      headerName: "Роль",
      minWidth: 150,
      cellRenderer: ({ data }: ICellRendererParams<AuthUser>) =>
        data ? (
          <Flex align="center" className="h-full">
            <Badge color={ROLE_BADGE_COLORS[data.role]} variant="soft">
              {ROLE_LABELS[data.role]}
            </Badge>
          </Flex>
        ) : null,
    },
    {
      field: "isActive",
      headerName: "Доступ",
      minWidth: 130,
      cellRenderer: ({ data }: ICellRendererParams<AuthUser>) =>
        data ? (
          <Flex align="center" className="h-full">
            <Badge color={data.isActive ? "green" : "gray"} variant="soft">
              {data.isActive ? "Активен" : "Отключён"}
            </Badge>
          </Flex>
        ) : null,
    },
    {
      field: "updatedAt",
      headerName: "Изменён",
      minWidth: 170,
      valueFormatter: ({ value }) => (value ? formatDateTime(value) : "—"),
    },
    {
      ...ACTION_COLUMN,
      width: 132,
      cellRenderer: ({ data }: ICellRendererParams<AuthUser>) =>
        data ? (
          <Flex align="center" justify="center" gap="1" className="h-full">
            <Button
              size="1"
              variant="soft"
              aria-label={`Редактировать ${data.fullName}`}
              title="Редактировать"
              onClick={() => edit(data)}
            >
              <Pencil size={14} />
            </Button>
            <Button
              size="1"
              variant="soft"
              color={data.isActive ? "red" : "green"}
              disabled={data.id === currentUserId}
              aria-label={`${data.isActive ? "Отключить" : "Восстановить"} ${data.fullName}`}
              title={
                data.id === currentUserId
                  ? "Нельзя отключить свою учётную запись"
                  : data.isActive
                    ? "Отключить доступ"
                    : "Восстановить доступ"
              }
              onClick={() => changeStatus(data)}
            >
              {data.isActive ? <PowerOff size={14} /> : <Power size={14} />}
            </Button>
          </Flex>
        ) : null,
    },
  ];

  const summary = allUsers.data ?? [];
  const countRole = (wanted: UserRole) =>
    summary.filter(({ role: itemRole }) => itemRole === wanted).length;

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4">
      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <div>
          <Heading size="6">Администрирование</Heading>
          <Text as="p" size="2" color="gray">
            Учётные записи, роли и доступ к тренажёру. История отключённых
            пользователей сохраняется.
          </Text>
        </div>
        <Button
          onClick={() => {
            mutations.create.reset();
            setUserToEdit(undefined);
            setFormOpen(true);
          }}
        >
          <UserPlus size={16} /> Создать пользователя
        </Button>
      </Flex>

      {allUsers.isPending ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} height="88px" className="rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <SummaryCard label="Всего" value={summary.length} />
          <SummaryCard
            label="Активны"
            value={summary.filter(({ isActive }) => isActive).length}
          />
          <SummaryCard
            label="Отключены"
            value={summary.filter(({ isActive }) => !isActive).length}
          />
          <SummaryCard label="Операторы" value={countRole("operator")} />
          <SummaryCard label="Преподаватели" value={countRole("instructor")} />
          <SummaryCard label="Администраторы" value={countRole("admin")} />
        </div>
      )}

      <Card size="2" variant="surface">
        <Flex gap="3" wrap="wrap">
          <TextField.Root
            className="min-w-64 flex-1"
            aria-label="Поиск пользователей"
            placeholder="Поиск по ФИО или email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          >
            <TextField.Slot>
              <Search size={16} />
            </TextField.Slot>
          </TextField.Root>
          <Select.Root
            value={role}
            onValueChange={(value) => setRole(value as UserRole | typeof ALL)}
          >
            <Select.Trigger className="min-w-44" aria-label="Фильтр по роли" />
            <Select.Content>
              <Select.Item value={ALL}>Все роли</Select.Item>
              {(Object.keys(ROLE_LABELS) as UserRole[]).map((value) => (
                <Select.Item key={value} value={value}>
                  {ROLE_LABELS[value]}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <Select.Root
            value={status}
            onValueChange={(value) =>
              setStatus(value as UserStatus | typeof ALL)
            }
          >
            <Select.Trigger
              className="min-w-44"
              aria-label="Фильтр по доступу"
            />
            <Select.Content>
              <Select.Item value={ALL}>Любой доступ</Select.Item>
              <Select.Item value="active">Активные</Select.Item>
              <Select.Item value="inactive">Отключённые</Select.Item>
            </Select.Content>
          </Select.Root>
        </Flex>
      </Card>

      {(allUsers.error || users.error) && (
        <Callout.Root color="red" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>
            Не удалось получить пользователей:{" "}
            {users.error?.message ?? allUsers.error?.message}
          </Callout.Text>
        </Callout.Root>
      )}

      <div className="min-h-80 flex-1">
        {users.isPending ? (
          <Skeleton height="100%" className="rounded-xl" />
        ) : (
          <DataTableReact<AuthUser>
            {...DATA_TABLE_DEFAULTS}
            rowData={users.data ?? []}
            columnDefs={columnDefs}
            getRowId={({ data }) => data.id}
          />
        )}
      </div>

      <UserFormDialog
        currentUserId={currentUserId}
        mutations={mutations}
        open={formOpen}
        user={userToEdit}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setUserToEdit(undefined);
        }}
      />
      <UserStatusDialog
        mutations={mutations}
        user={userToToggle}
        onOpenChange={(open) => !open && setUserToToggle(undefined)}
      />
    </main>
  );
}
