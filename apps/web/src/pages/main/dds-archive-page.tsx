import { labelFor } from "../../lib/labels";
import { DataTableReact } from "@bolid-ui/data-table";
import type {
  ColDef,
  DefaultMenuItem,
  GetContextMenuItemsParams,
  ICellRendererParams,
  MenuItemDef,
} from "@bolid-ui/data-table/community";
import {
  Badge,
  Button,
  Callout,
  DatePicker,
  Flex,
  Heading,
  Select,
  Skeleton,
  Text,
  TextField,
} from "@bolid-ui/themes";
import { AlertTriangle, Eye, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import {
  DDS_CATEGORY_LABELS,
  DDS_SERVICE_LABELS,
  DDS_STATUS_LABELS,
} from "../../components/dds/dds-formatters";
import { formatDateTime } from "../../components/training/training-labels";
import { ROUTES } from "../../config/routes";
import {
  DDS_ARCHIVE_STATUSES,
  type DdsArchiveFilter,
  type DdsArchiveItem,
} from "../../contracts/dds-archive";
import { DISPATCH_SERVICES } from "../../contracts/incident";
import { SCENARIO_CATEGORIES } from "../../contracts/scenario-authoring";
import { useDdsArchive } from "../../hooks/use-dds-archive";
import { DATA_TABLE_DEFAULTS, menuIcon } from "../../lib/data-table";
import { toDate, toDateOnly } from "../../lib/date-only";
import { useAuthStore } from "../../stores/auth.store";

const PAGE_SIZE = 20;
/** Значение «любой» в выпадающем списке: пустую строку Select не принимает. */
const ANY = "any";

const OUTCOME_LABELS = {
  passed: "Сдано",
  failed: "Не сдано",
  unfinished: "Без оценки",
} as const;

const outcomeBadge = (item: DdsArchiveItem) => {
  if (item.passed === null)
    return { label: "Без оценки", color: "gray" } as const;
  return item.passed
    ? ({ label: `Сдано · ${item.score ?? 0}`, color: "green" } as const)
    : ({ label: `Не сдано · ${item.score ?? 0}`, color: "red" } as const);
};

/**
 * Архив разобранных карточек ДДС.
 *
 * Очередь отвечает на вопрос «что делать сейчас», а архив — на вопрос
 * «что было»: найти происшествие по адресу, типу или дате спустя недели после
 * занятия. Обучающийся видит здесь только свои карточки, преподаватель — все.
 */
export default function DdsArchivePage() {
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const [search, setSearch] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [status, setStatus] = useState<string>(ANY);
  const [service, setService] = useState<string>(ANY);
  const [category, setCategory] = useState<string>(ANY);
  const [outcome, setOutcome] = useState<string>(ANY);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const filter = useMemo<DdsArchiveFilter>(
    () => ({
      ...(submitted ? { search: submitted } : {}),
      ...(status === ANY
        ? {}
        : { status: status as DdsArchiveFilter["status"] }),
      ...(service === ANY
        ? {}
        : { service: service as DdsArchiveFilter["service"] }),
      ...(category === ANY
        ? {}
        : { category: category as DdsArchiveFilter["category"] }),
      ...(outcome === ANY
        ? {}
        : { outcome: outcome as DdsArchiveFilter["outcome"] }),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [submitted, status, service, category, outcome, from, to, page],
  );

  const archive = useDdsArchive(filter);
  const total = archive.data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const showOperator = role !== "operator";

  // Любая смена фильтра возвращает на первую страницу: иначе после сужения
  // выборки пользователь оказывается на пустой странице номер семь.
  const change = <T,>(apply: (value: T) => void) => {
    return (value: T) => {
      setPage(0);
      apply(value);
    };
  };

  const reset = () => {
    setSearch("");
    setSubmitted("");
    setStatus(ANY);
    setService(ANY);
    setCategory(ANY);
    setOutcome(ANY);
    setFrom(null);
    setTo(null);
    setPage(0);
  };

  const columnDefs: ColDef<DdsArchiveItem>[] = [
    {
      colId: "createdAt",
      headerName: "Поступила",
      minWidth: 160,
      valueGetter: ({ data }) => data?.createdAt,
      valueFormatter: ({ value }) => formatDateTime(value as string),
    },
    { field: "scenarioCode", headerName: "Сценарий", minWidth: 110 },
    { field: "title", headerName: "Происшествие", flex: 2, minWidth: 200 },
    { field: "incidentType", headerName: "Тип", flex: 2, minWidth: 180 },
    { field: "addressText", headerName: "Адрес", flex: 2, minWidth: 220 },
    {
      colId: "category",
      headerName: "Класс",
      minWidth: 120,
      valueGetter: ({ data }) =>
        data ? labelFor(DDS_CATEGORY_LABELS, data.category, "прочее") : "",
    },
    {
      colId: "service",
      headerName: "Служба",
      minWidth: 170,
      valueGetter: ({ data }) =>
        data ? DDS_SERVICE_LABELS[data.addressedService] : "",
    },
    ...(showOperator
      ? [
          {
            colId: "operator",
            headerName: "Диспетчер",
            minWidth: 180,
            valueGetter: ({ data }: { data?: DdsArchiveItem }) =>
              data?.operator?.fullName ?? "—",
          } satisfies ColDef<DdsArchiveItem>,
        ]
      : []),
    {
      colId: "status",
      headerName: "Статус",
      minWidth: 200,
      valueGetter: ({ data }) => (data ? DDS_STATUS_LABELS[data.status] : ""),
    },
    {
      colId: "outcome",
      headerName: "Итог",
      minWidth: 150,
      valueGetter: ({ data }) => data?.score ?? null,
      cellRenderer: ({ data }: ICellRendererParams<DdsArchiveItem>) => {
        if (!data) return null;
        const badge = outcomeBadge(data);
        return (
          <Flex align="center" className="h-full">
            <Badge color={badge.color} variant="soft">
              {badge.label}
            </Badge>
          </Flex>
        );
      },
    },
  ];

  const openCard = (item: DdsArchiveItem) =>
    navigate(
      showOperator && item.lesson
        ? ROUTES.ddsLessonReport(item.lesson.id)
        : ROUTES.ddsResult(item.id),
    );

  const getContextMenuItems = ({
    node,
  }: GetContextMenuItemsParams<DdsArchiveItem>): (
    | DefaultMenuItem
    | MenuItemDef<DdsArchiveItem>
  )[] => {
    const item = node?.data;
    if (!item) return [];
    return [
      {
        name: showOperator ? "Открыть отчёт занятия" : "Открыть разбор",
        icon: menuIcon(Eye),
        action: () => openCard(item),
      },
    ];
  };

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4 md:p-6">
      <div>
        <Heading size="6">Архив карточек</Heading>
        <Text as="p" size="2" color="gray">
          {showOperator
            ? "Все разобранные карточки ДДС с поиском по адресу, типу происшествия и периоду."
            : "Ваши разобранные карточки ДДС с поиском по адресу, типу происшествия и периоду."}
        </Text>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1 md:col-span-2">
          <Text size="2" weight="bold">
            Поиск
          </Text>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setPage(0);
              setSubmitted(search.trim());
            }}
          >
            <TextField.Root
              value={search}
              placeholder="Адрес, тип происшествия, номер сценария"
              onChange={(event) => setSearch(event.target.value)}
            >
              <TextField.Slot>
                <Search size={16} />
              </TextField.Slot>
            </TextField.Root>
          </form>
        </label>

        <label className="grid gap-1">
          <Text size="2" weight="bold">
            Статус
          </Text>
          <Select.Root value={status} onValueChange={change(setStatus)}>
            <Select.Trigger />
            <Select.Content>
              <Select.Item value={ANY}>Любой</Select.Item>
              {DDS_ARCHIVE_STATUSES.map((value) => (
                <Select.Item key={value} value={value}>
                  {DDS_STATUS_LABELS[value]}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </label>

        <label className="grid gap-1">
          <Text size="2" weight="bold">
            Итог
          </Text>
          <Select.Root value={outcome} onValueChange={change(setOutcome)}>
            <Select.Trigger />
            <Select.Content>
              <Select.Item value={ANY}>Любой</Select.Item>
              {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
                <Select.Item key={value} value={value}>
                  {label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </label>

        <label className="grid gap-1">
          <Text size="2" weight="bold">
            Служба
          </Text>
          <Select.Root value={service} onValueChange={change(setService)}>
            <Select.Trigger />
            <Select.Content>
              <Select.Item value={ANY}>Любая</Select.Item>
              {DISPATCH_SERVICES.map((value) => (
                <Select.Item key={value} value={value}>
                  {DDS_SERVICE_LABELS[value]}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </label>

        <label className="grid gap-1">
          <Text size="2" weight="bold">
            Класс происшествия
          </Text>
          <Select.Root value={category} onValueChange={change(setCategory)}>
            <Select.Trigger />
            <Select.Content>
              <Select.Item value={ANY}>Любой</Select.Item>
              {SCENARIO_CATEGORIES.map((value) => (
                <Select.Item key={value} value={value}>
                  {DDS_CATEGORY_LABELS[value] ?? value}
                </Select.Item>
              ))}
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
          {archive.isPending
            ? "Идёт поиск…"
            : `Найдено карточек: ${total}${
                total > 0
                  ? ` · показаны ${filter.offset + 1}–${Math.min(
                      filter.offset + PAGE_SIZE,
                      total,
                    )}`
                  : ""
              }`}
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
            onClick={() => setPage((current) => Math.min(lastPage, current + 1))}
          >
            Вперёд
          </Button>
        </Flex>
      </Flex>

      {archive.error && (
        <Callout.Root color="red" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>
            Не удалось получить архив: {archive.error.message}
          </Callout.Text>
        </Callout.Root>
      )}

      <div className="min-h-80 flex-1">
        {archive.isPending ? (
          <Skeleton height="100%" className="rounded-(--radius-4)" />
        ) : (
          <DataTableReact<DdsArchiveItem>
            {...DATA_TABLE_DEFAULTS}
            rowData={archive.data?.items ?? []}
            columnDefs={columnDefs}
            getRowId={({ data }) => data.id}
            getContextMenuItems={getContextMenuItems}
            onRowDoubleClicked={({ data }) => data && openCard(data)}
          />
        )}
      </div>
    </main>
  );
}
