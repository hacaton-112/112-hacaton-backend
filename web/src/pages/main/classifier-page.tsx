import {
  Badge,
  Button,
  Callout,
  Card,
  Flex,
  ScrollArea,
  Spinner,
  Table,
  Text,
  toast,
} from "@bolid-ui/themes";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import { useState } from "react";

import { canManageClassifier } from "../../config/roles";
import type { ClassifierVersion } from "../../contracts/classifier";
import {
  useClassifierManagement,
  useClassifierVersions,
} from "../../hooks/use-classifier";
import { useAuthStore } from "../../stores/auth.store";

const STATUS_LABELS: Record<ClassifierVersion["status"], string> = {
  draft: "Черновик",
  active: "Активна",
  superseded: "Предыдущая",
};

const STATUS_COLORS = {
  draft: "amber",
  active: "green",
  superseded: "gray",
} as const;

export default function ClassifierPage() {
  const user = useAuthStore((state) => state.user);
  const canManage = canManageClassifier(user?.role);
  const versions = useClassifierVersions();
  const management = useClassifierManagement();
  const [file, setFile] = useState<File>();
  const [expandedVersionId, setExpandedVersionId] = useState<string>();

  const importFile = async () => {
    if (!file) return;

    try {
      const imported = await management.importVersion.mutateAsync(file);
      setFile(undefined);
      toast.success("Версия " + imported.version + " импортирована", {
        description:
          "Она сохранена как черновик. Проверьте предупреждения и активируйте её отдельно.",
      });
    } catch {
      // Ошибка остаётся под формой, чтобы администратор мог заменить файл.
    }
  };

  const activate = async (version: ClassifierVersion) => {
    try {
      await management.activateVersion.mutateAsync(version.id);
      toast.success("Версия " + version.version + " активирована", {
        description:
          "Новые карточки используют её. Уже выбранные типы сохраняют прежнюю версию.",
      });
    } catch {
      // Предметная ошибка показана рядом со списком.
    }
  };

  return (
    <ScrollArea className="h-full" type="auto" scrollbars="vertical">
      <main className="grid w-full gap-4 p-4 md:p-6">
        <header>
          <Text as="div" role="heading" aria-level={1} size="6" weight="bold">
            Классификатор происшествий
          </Text>
          <Text as="p" size="2" color="gray" mt="1">
            Версии официального XLSX, дерево признаков и правила направления
            служб. Импорт не меняет работу операторов до явной активации.
          </Text>
        </header>

        {canManage ? (
          <Card size="3" variant="classic">
            <Flex align="start" justify="between" gap="4" wrap="wrap">
              <div className="max-w-[650px]">
                <Flex align="center" gap="2">
                  <FileSpreadsheet size={20} aria-hidden />
                  <Text size="3" weight="bold">
                    Импорт новой версии
                  </Text>
                </Flex>
                <Text as="p" size="2" color="gray" mt="2">
                  Выберите исходный файл формата XLSX. Сервер проверит структуру
                  листа, номера строк и правила служб; повторный импорт того же
                  файла не создаст дубликат.
                </Text>
              </div>
              <Flex align="center" gap="2" wrap="wrap">
                {/* Поле выбора файла спрятано под обычной кнопкой: свой вид у
                    него в каждом браузере свой. */}
                <Button asChild variant="soft" size="1">
                  <label className="cursor-pointer">
                    <input
                      className="sr-only"
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={(event) => setFile(event.target.files?.[0])}
                    />
                    {file ? file.name : "Выбрать XLSX"}
                  </label>
                </Button>
                <Button
                  type="button"
                  disabled={!file || management.importVersion.isPending}
                  onClick={() => void importFile()}
                >
                  {management.importVersion.isPending ? (
                    <Spinner size="1" />
                  ) : (
                    <Upload size={15} />
                  )}
                  Импортировать
                </Button>
              </Flex>
            </Flex>
            {management.importVersion.error && (
              <Callout.Root color="red" size="1" mt="3" role="alert">
                <Callout.Icon>
                  <AlertTriangle size={15} />
                </Callout.Icon>
                <Callout.Text>
                  {management.importVersion.error.message}
                </Callout.Text>
              </Callout.Root>
            )}
          </Card>
        ) : (
          <Callout.Root color="blue">
            <Callout.Icon>
              <CheckCircle2 size={16} />
            </Callout.Icon>
            <Callout.Text>
              Вы можете проверить активную версию и предупреждения импорта.
              Загружает и активирует версии администратор.
            </Callout.Text>
          </Callout.Root>
        )}

        <div className="grid gap-3">
          <Flex align="center" justify="between" gap="3">
            <Text size="4" weight="bold">
              Версии
            </Text>
            {versions.isFetching && <Spinner size="1" />}
          </Flex>

          {versions.error && !versions.data ? (
            <Callout.Root color="red" role="alert">
              <Callout.Icon>
                <AlertTriangle size={16} />
              </Callout.Icon>
              <Callout.Text>
                {versions.error.message}{" "}
                <Button
                  size="1"
                  color="red"
                  variant="soft"
                  onClick={() => void versions.refetch()}
                >
                  Повторить
                </Button>
              </Callout.Text>
            </Callout.Root>
          ) : versions.isPending ? (
            <Flex align="center" justify="center" py="8">
              <Spinner size="3" />
            </Flex>
          ) : versions.data.length === 0 ? (
            <Text color="gray" size="2">
              Версий пока нет. Импортируйте официальный XLSX-файл.
            </Text>
          ) : (
            <div className="overflow-x-auto">
              <Table.Root size="2" variant="surface">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Версия</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Файл</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Записей</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Проверка</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Импорт</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">
                      Действие
                    </Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {versions.data.map((version) => (
                    <VersionRows
                      key={version.id}
                      version={version}
                      canManage={canManage}
                      expanded={expandedVersionId === version.id}
                      activating={
                        management.activateVersion.isPending &&
                        management.activateVersion.variables === version.id
                      }
                      onToggleWarnings={() =>
                        setExpandedVersionId((current) =>
                          current === version.id ? undefined : version.id,
                        )
                      }
                      onActivate={() => void activate(version)}
                    />
                  ))}
                </Table.Body>
              </Table.Root>
            </div>
          )}

          {management.activateVersion.error && (
            <Callout.Root color="red" size="1" mt="1" role="alert">
              <Callout.Icon>
                <AlertTriangle size={15} />
              </Callout.Icon>
              <Callout.Text>
                {management.activateVersion.error.message}
              </Callout.Text>
            </Callout.Root>
          )}
        </div>
      </main>
    </ScrollArea>
  );
}

function VersionRows({
  version,
  canManage,
  expanded,
  activating,
  onToggleWarnings,
  onActivate,
}: {
  version: ClassifierVersion;
  canManage: boolean;
  expanded: boolean;
  activating: boolean;
  onToggleWarnings: () => void;
  onActivate: () => void;
}) {
  return (
    <>
      <Table.Row>
        <Table.Cell>
          <Flex align="center" gap="2">
            <Text weight="bold">v{version.version}</Text>
            <Badge color={STATUS_COLORS[version.status]} variant="soft">
              {STATUS_LABELS[version.status]}
            </Badge>
          </Flex>
        </Table.Cell>
        <Table.Cell>
          <Text title={version.sourceFileName}>{version.sourceFileName}</Text>
        </Table.Cell>
        <Table.Cell>{version.recordCount.toLocaleString("ru-RU")}</Table.Cell>
        <Table.Cell>
          {version.warningCount > 0 ? (
            <Button
              type="button"
              size="1"
              variant="ghost"
              color="amber"
              onClick={onToggleWarnings}
            >
              {version.warningCount} предупреждений
            </Button>
          ) : (
            <Badge color="green" variant="soft">
              Без предупреждений
            </Badge>
          )}
        </Table.Cell>
        <Table.Cell>{formatDate(version.importedAt)}</Table.Cell>
        <Table.Cell justify="end">
          {canManage && version.status !== "active" ? (
            <Button
              type="button"
              size="1"
              variant="soft"
              disabled={activating}
              onClick={onActivate}
            >
              {activating && <Spinner size="1" />}
              Активировать
            </Button>
          ) : (
            <Text size="1" color="gray">
              {version.status === "active" ? "Используется" : "Только просмотр"}
            </Text>
          )}
        </Table.Cell>
      </Table.Row>
      {expanded && version.warningCount > 0 && (
        <Table.Row>
          <Table.Cell colSpan={6}>
            <div className="max-h-56 overflow-y-auto rounded-(--radius-2) bg-(--gray-a2) p-3">
              <Text size="1" weight="bold">
                Что нужно проверить в исходном файле
              </Text>
              <ul className="mt-2 grid list-disc gap-1 pl-5 text-sm text-(--gray-11)">
                {version.warnings.map((warning, index) => (
                  <li key={[warning.row, warning.column, index].join(":")}>
                    Строка {warning.row}, столбец {warning.column}:{" "}
                    {warning.code === "missing_ekp_type"
                      ? "не указан тип ЕКП"
                      : "не указана главная служба"}
                  </li>
                ))}
              </ul>
            </div>
          </Table.Cell>
        </Table.Row>
      )}
    </>
  );
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
