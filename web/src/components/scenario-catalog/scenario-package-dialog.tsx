import { DataTableReact } from "@bolid-ui/data-table";
import type { ColDef } from "@bolid-ui/data-table/community";
import { Button, Callout, Dialog, Flex, Spinner, Text } from "@bolid-ui/themes";
import { AlertTriangle, Upload } from "lucide-react";
import { useMemo, useState, type ChangeEvent } from "react";

import { type ScenarioImportReport } from "../../contracts/scenario-authoring";
import { DATA_TABLE_DEFAULTS } from "../../lib/data-table";
import { scenarioService } from "../../services/scenario.service";

const OUTCOME_LABELS = {
  created: "Будет создан",
  updated: "Будет обновлён новой версией",
  rejected: "Отклонён",
};

export function ScenarioPackageDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [packageData, setPackageData] = useState<unknown>();
  const [report, setReport] = useState<ScenarioImportReport>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const columns = useMemo<ColDef<ScenarioImportReport["entries"][number]>[]>(
    () => [
      { field: "code", headerName: "Код", minWidth: 130 },
      {
        field: "outcome",
        headerName: "Результат проверки",
        minWidth: 230,
        valueFormatter: ({ value }) =>
          OUTCOME_LABELS[value as keyof typeof OUTCOME_LABELS] ?? value,
      },
      { field: "reason", headerName: "Причина", minWidth: 280 },
    ],
    [],
  );

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPending(true);
    setError(undefined);
    setReport(undefined);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      setPackageData(parsed);
      setReport(await scenarioService.importPackage(parsed, true));
    } catch (caught) {
      setPackageData(undefined);
      setError(
        caught instanceof Error
          ? caught.message
          : "Файл не соответствует формату пакета сценариев",
      );
    } finally {
      setPending(false);
    }
  };

  const confirm = async () => {
    if (!packageData || !report || report.accepted === 0) return;
    setPending(true);
    setError(undefined);
    try {
      const result = await scenarioService.importPackage(packageData, false);
      setReport(result);
      onImported();
      onOpenChange(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось импортировать сценарии",
      );
    } finally {
      setPending(false);
    }
  };

  const close = (next: boolean) => {
    if (!next) {
      setPackageData(undefined);
      setReport(undefined);
      setError(undefined);
    }
    onOpenChange(next);
  };

  return (
    <Dialog.Root open={open} onOpenChange={pending ? undefined : close}>
      <Dialog.Content
        maxWidth="820px"
        className="w-[calc(100vw-2rem)] sm:max-w-[820px]"
      >
        <Dialog.Title>Загрузить сценарии</Dialog.Title>
        <Dialog.Description size="2" mb="3">
          Сначала сервер проверит весь JSON без записи. После проверки
          подтвердите создание новых версий.
        </Dialog.Description>
        {/* Поле выбора файла спрятано под обычной кнопкой: свой вид у него в
            каждом браузере свой, а рядом стоят кнопки приложения. */}
        <Button asChild variant="soft">
          <label className="cursor-pointer">
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(event) => void selectFile(event)}
            />
            <Upload size={16} /> Выбрать JSON-файл
          </label>
        </Button>
        {pending && !report && (
          <Flex align="center" gap="2" mt="3">
            <Spinner size="1" />
            <Text size="2">Проверяем пакет…</Text>
          </Flex>
        )}
        {error && (
          <Callout.Root color="red" size="1" mt="3" role="alert">
            <Callout.Icon>
              <AlertTriangle size={16} />
            </Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}
        {report && (
          <div className="mt-4 grid gap-2">
            <Text size="2">
              Принято: {report.accepted}. Отклонено: {report.rejected}.
            </Text>
            <div className="h-72 min-w-0">
              <DataTableReact<ScenarioImportReport["entries"][number]>
                {...DATA_TABLE_DEFAULTS}
                rowData={report.entries}
                columnDefs={columns}
                getRowId={({ data }) =>
                  `${data.code}:${data.outcome}:${data.reason ?? ""}`
                }
              />
            </div>
          </div>
        )}
        <Flex justify="end" gap="2" mt="4">
          <Dialog.Close>
            <Button variant="soft" color="gray" disabled={pending}>
              Отмена
            </Button>
          </Dialog.Close>
          <Button
            disabled={pending || !report || report.accepted === 0}
            onClick={() => void confirm()}
          >
            {pending ? <Spinner size="1" /> : null}
            Подтвердить импорт
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
