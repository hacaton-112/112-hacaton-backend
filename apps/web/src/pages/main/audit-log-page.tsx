import { DataTableReact } from "@bolid-ui/data-table";
import type {
  ColDef,
  ICellRendererParams,
} from "@bolid-ui/data-table/community";
import {
  Badge,
  Button,
  Callout,
  DatePicker,
  Dialog,
  Flex,
  Heading,
  Select,
  Skeleton,
  Text,
  TextField,
} from "@bolid-ui/themes";
import { AlertTriangle, Eye, X } from "lucide-react";
import { useMemo, useState } from "react";

import {
  AUDIT_ACTION_OPTIONS,
  AUDIT_RESOURCE_OPTIONS,
  auditActionLabel,
  auditResourceLabel,
} from "../../components/admin/audit-log-formatters";
import { formatDateTime } from "../../components/training/training-labels";
import type { AuditLogFilter, AuditLogItem } from "../../contracts/audit-log";
import { useAuditLog } from "../../hooks/use-audit-log";
import { useAdminUsers } from "../../hooks/use-users";
import { DATA_TABLE_DEFAULTS } from "../../lib/data-table";
import { toDate, toDateOnly } from "../../lib/date-only";

const PAGE_SIZE = 20;
const ANY = "any";

export default function AuditLogPage() {
  const [actorId, setActorId] = useState(ANY);
  const [action, setAction] = useState(ANY);
  const [resource, setResource] = useState(ANY);
  const [resourceId, setResourceId] = useState("");
  const [hasError, setHasError] = useState(ANY);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AuditLogItem>();
  const users = useAdminUsers();

  const change =
    <T,>(apply: (value: T) => void) =>
    (value: T) => {
      setPage(0);
      apply(value);
    };

  const filter = useMemo<AuditLogFilter>(
    () => ({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(actorId !== ANY ? { actorId } : {}),
      ...(action !== ANY ? { action } : {}),
      ...(resource !== ANY ? { resource } : {}),
      ...(resourceId.trim() ? { resourceId: resourceId.trim() } : {}),
      ...(hasError !== ANY ? { hasError: hasError === "yes" } : {}),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [action, actorId, from, hasError, page, resource, resourceId, to],
  );
  const audit = useAuditLog(filter);
  const total = audit.data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  const columns: ColDef<AuditLogItem>[] = [
    {
      field: "createdAt",
      headerName: "Время",
      minWidth: 170,
      valueFormatter: ({ value }) => formatDateTime(value as string),
    },
    {
      colId: "actor",
      headerName: "Кто",
      flex: 2,
      minWidth: 220,
      valueGetter: ({ data }) =>
        data?.actor?.fullName ?? data?.actor?.email ?? "Система",
    },
    {
      colId: "action",
      headerName: "Событие",
      flex: 2,
      minWidth: 240,
      valueGetter: ({ data }) => (data ? auditActionLabel(data.action) : ""),
    },
    {
      colId: "resource",
      headerName: "Объект",
      flex: 1,
      minWidth: 180,
      valueGetter: ({ data }) =>
        data ? auditResourceLabel(data.resource) : "",
    },
    {
      field: "ipAddress",
      headerName: "IP-адрес",
      minWidth: 140,
      valueFormatter: ({ value }) => (value as string | null) ?? "—",
    },
    {
      colId: "result",
      headerName: "Результат",
      minWidth: 130,
      cellRenderer: ({ data }: ICellRendererParams<AuditLogItem>) =>
        data ? (
          <Flex align="center" className="h-full">
            <Badge color={data.hasError ? "red" : "green"} variant="soft">
              {data.hasError ? "Ошибка" : "Успешно"}
            </Badge>
          </Flex>
        ) : null,
    },
    {
      colId: "details",
      headerName: "",
      minWidth: 72,
      maxWidth: 72,
      sortable: false,
      cellRenderer: ({ data }: ICellRendererParams<AuditLogItem>) =>
        data ? (
          <Flex align="center" justify="center" className="h-full">
            <Button
              type="button"
              variant="ghost"
              aria-label="Подробности записи"
              onClick={() => setSelected(data)}
            >
              <Eye size={16} />
            </Button>
          </Flex>
        ) : null,
    },
  ];

  const reset = () => {
    setActorId(ANY);
    setAction(ANY);
    setResource(ANY);
    setResourceId("");
    setHasError(ANY);
    setFrom(null);
    setTo(null);
    setPage(0);
  };

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4 md:p-6">
      <div>
        <Heading size="6">Журнал аудита</Heading>
        <Text as="p" size="2" color="gray">
          Значимые действия пользователей и события безопасности системы.
        </Text>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1">
          <Text size="2" weight="bold">
            Автор
          </Text>
          <Select.Root value={actorId} onValueChange={change(setActorId)}>
            <Select.Trigger />
            <Select.Content>
              <Select.Item value={ANY}>Любой</Select.Item>
              {(users.data ?? []).map((user) => (
                <Select.Item key={user.id} value={user.id}>
                  {user.fullName} · {user.email}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </label>

        <label className="grid gap-1">
          <Text size="2" weight="bold">
            Действие
          </Text>
          <Select.Root value={action} onValueChange={change(setAction)}>
            <Select.Trigger />
            <Select.Content>
              <Select.Item value={ANY}>Любое</Select.Item>
              {AUDIT_ACTION_OPTIONS.map((option) => (
                <Select.Item key={option.value} value={option.value}>
                  {option.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </label>

        <label className="grid gap-1">
          <Text size="2" weight="bold">
            Объект
          </Text>
          <Select.Root value={resource} onValueChange={change(setResource)}>
            <Select.Trigger />
            <Select.Content>
              <Select.Item value={ANY}>Любой</Select.Item>
              {AUDIT_RESOURCE_OPTIONS.map((option) => (
                <Select.Item key={option.value} value={option.value}>
                  {option.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </label>

        <label className="grid gap-1">
          <Text size="2" weight="bold">
            Идентификатор объекта
          </Text>
          <TextField.Root
            value={resourceId}
            placeholder="UUID или системный идентификатор"
            onChange={(event) => change(setResourceId)(event.target.value)}
          />
        </label>

        <label className="grid gap-1">
          <Text size="2" weight="bold">
            Результат
          </Text>
          <Select.Root value={hasError} onValueChange={change(setHasError)}>
            <Select.Trigger />
            <Select.Content>
              <Select.Item value={ANY}>Любой</Select.Item>
              <Select.Item value="no">Без ошибки</Select.Item>
              <Select.Item value="yes">С ошибкой</Select.Item>
            </Select.Content>
          </Select.Root>
        </label>

        <label className="grid gap-1">
          <Text size="2" weight="bold">
            С даты
          </Text>
          <DatePicker
            placeholder="дд.мм.гггг"
            value={toDate(from)}
            onChange={(value) => change(setFrom)(toDateOnly(value))}
          />
        </label>

        <label className="grid gap-1">
          <Text size="2" weight="bold">
            По дату
          </Text>
          <DatePicker
            placeholder="дд.мм.гггг"
            value={toDate(to)}
            onChange={(value) => change(setTo)(toDateOnly(value))}
          />
        </label>
      </div>

      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <Text size="2" color="gray">
          {audit.isPending ? "Загрузка…" : `Найдено записей: ${total}`}
        </Text>
        <Flex align="center" gap="2">
          <Button variant="soft" onClick={reset}>
            <X size={16} /> Сбросить фильтры
          </Button>
          <Button
            variant="soft"
            disabled={page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            Назад
          </Button>
          <Button
            variant="soft"
            disabled={page >= lastPage}
            onClick={() =>
              setPage((current) => Math.min(lastPage, current + 1))
            }
          >
            Вперёд
          </Button>
        </Flex>
      </Flex>

      {audit.error && (
        <Callout.Root color="red" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>
            Не удалось получить журнал: {audit.error.message}
          </Callout.Text>
        </Callout.Root>
      )}

      <div className="min-h-80 flex-1">
        {audit.isPending ? (
          <Skeleton height="100%" className="rounded-(--radius-4)" />
        ) : (
          <DataTableReact<AuditLogItem>
            {...DATA_TABLE_DEFAULTS}
            rowData={audit.data?.items ?? []}
            columnDefs={columns}
            getRowId={({ data }) => data.id}
            onRowDoubleClicked={({ data }) => data && setSelected(data)}
          />
        )}
      </div>

      <Dialog.Root
        open={selected !== undefined}
        onOpenChange={(open) => !open && setSelected(undefined)}
      >
        <Dialog.Content
          maxWidth="720px"
          className="w-[calc(100vw-2rem)] sm:max-w-[720px]"
        >
          <Dialog.Title>Подробности записи</Dialog.Title>
          <div className="mt-3 grid gap-2 text-sm">
            <Text>
              <strong>Действие:</strong> {selected?.action}
            </Text>
            <Text>
              <strong>Ресурс:</strong> {selected?.resource}
            </Text>
            <Text>
              <strong>ID ресурса:</strong> {selected?.resourceId ?? "—"}
            </Text>
            <Text>
              <strong>ID сессии:</strong> {selected?.sessionId ?? "—"}
            </Text>
            <Text>
              <strong>IP-адрес:</strong> {selected?.ipAddress ?? "—"}
            </Text>
            <Text>
              <strong>Автор:</strong> {selected?.actor?.fullName ?? "Система"}
            </Text>
            <Text>
              <strong>Email:</strong> {selected?.actor?.email ?? "—"}
            </Text>
            <Text weight="bold">Служебные сведения</Text>
            <pre className="bg-gray-3 max-h-64 overflow-auto rounded p-3 text-xs">
              {selected?.details
                ? JSON.stringify(selected.details, null, 2)
                : "Нет дополнительных сведений"}
            </pre>
          </div>
          <Flex justify="end" mt="4">
            <Dialog.Close>
              <Button variant="soft">Закрыть</Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </main>
  );
}
