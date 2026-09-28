import {
  Badge,
  Button,
  Callout,
  Card,
  Checkbox,
  Flex,
  Heading,
  Select,
  Text,
  TextField,
} from "@bolid-ui/themes";
import { AlertTriangle, Download, PhoneCall, Upload } from "lucide-react";
import { useState } from "react";

import type { AuthUser } from "../../contracts/auth";
import { useTelephonyWorkstations } from "../../hooks/use-telephony-workstations";

const EXTENSION = /^\d{2,6}$/u;

/**
 * Рабочие места ДДС в учебной IP-АТС.
 *
 * Asterisk знает только внутренний номер телефона, с которого звонят наряду.
 * Кто сидит за этим телефоном, задаёт администратор: по этой привязке звонок
 * относится к карточке нужного диспетчера.
 */
export function TelephonyWorkstationsCard({
  users,
}: {
  users: readonly AuthUser[];
}) {
  const { workstations, seat, free, exportConfiguration, importConfiguration } =
    useTelephonyWorkstations();
  const [extension, setExtension] = useState("");
  const [userId, setUserId] = useState<string>();
  const trainees = users.filter(
    (user) => user.isActive && user.role === "operator",
  );
  const extensionValid = EXTENSION.test(extension.trim());
  const [importFile, setImportFile] = useState<File>();
  const [dryRun, setDryRun] = useState(true);
  const failure =
    workstations.error ??
    seat.error ??
    free.error ??
    exportConfiguration.error ??
    importConfiguration.error;

  const submit = () => {
    if (!extensionValid || !userId) return;
    seat.mutate(
      { extension: extension.trim(), userId },
      { onSuccess: () => setExtension("") },
    );
  };

  return (
    <Card size="3" variant="classic" className="grid shrink-0 gap-3">
      <Flex align="center" gap="2">
        <PhoneCall size={18} />
        <Heading size="4">Рабочие места ДДС</Heading>
      </Flex>
      <Text size="2" color="gray">
        Диспетчер ДДС передаёт карточку наряду со своего SIP-телефона. Укажите,
        кто сидит за каким внутренним номером учебной АТС, — иначе звонок наряду
        не отнесётся к его карточке.
      </Text>

      {failure && (
        <Callout.Root color="red" role="alert" size="1">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>{failure.message}</Callout.Text>
        </Callout.Root>
      )}

      <div className="grid gap-2" aria-label="Занятые рабочие места">
        {(workstations.data ?? []).map((workstation) => (
          <Flex
            key={workstation.extension}
            align="center"
            justify="between"
            gap="3"
          >
            <Flex align="center" gap="2">
              <Badge variant="soft" className="font-mono">
                {workstation.extension}
              </Badge>
              <Text size="2">
                {workstation.name} — {workstation.fullName ?? "не назначен"}
              </Text>
              {!workstation.isActive && <Badge color="gray">Отключено</Badge>}
            </Flex>
            <Button
              type="button"
              size="1"
              variant="soft"
              color="gray"
              disabled={free.isPending}
              onClick={() => free.mutate(workstation.extension)}
            >
              Освободить
            </Button>
          </Flex>
        ))}
        {workstations.data?.length === 0 && (
          <Text size="1" color="gray">
            Пока никто не посажен за телефоны.
          </Text>
        )}
      </div>

      <Flex gap="2" wrap="wrap" align="end">
        <TextField.Root
          className="w-32"
          aria-label="Внутренний номер"
          placeholder="201"
          inputMode="numeric"
          value={extension}
          onChange={(event) => setExtension(event.target.value)}
        />
        <Select.Root value={userId} onValueChange={setUserId}>
          <Select.Trigger
            className="min-w-64"
            placeholder="Диспетчер"
            aria-label="Диспетчер за телефоном"
          />
          <Select.Content>
            {trainees.map((user) => (
              <Select.Item key={user.id} value={user.id}>
                {user.fullName}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <Button
          type="button"
          disabled={!extensionValid || !userId || seat.isPending}
          onClick={submit}
        >
          Посадить за телефон
        </Button>
      </Flex>

      <div className="border-t border-(--gray-a5) pt-3">
        <Flex gap="2" wrap="wrap" align="center">
          <Text size="2" weight="medium">
            Обмен конфигурацией
          </Text>
          <Button
            type="button"
            size="1"
            variant="soft"
            disabled={exportConfiguration.isPending}
            onClick={() => exportConfiguration.mutate("xml")}
          >
            <Download size={14} /> XML
          </Button>
          <Button
            type="button"
            size="1"
            variant="soft"
            disabled={exportConfiguration.isPending}
            onClick={() => exportConfiguration.mutate("csv")}
          >
            <Download size={14} /> CSV
          </Button>
          {/* Поле выбора файла спрятано под обычной кнопкой: свой вид у него
              в каждом браузере свой, а имя файла показываем рядом. */}
          <Button asChild variant="soft" size="1">
            <label className="cursor-pointer">
              <input
                aria-label="Файл конфигурации рабочих мест"
                className="sr-only"
                type="file"
                accept=".xml,.csv,text/csv,application/xml"
                onChange={(event) => setImportFile(event.target.files?.[0])}
              />
              {importFile ? importFile.name : "Выбрать файл"}
            </label>
          </Button>
          <Text as="label" size="2" className="flex items-center gap-2">
            <Checkbox
              checked={dryRun}
              onCheckedChange={(checked) => setDryRun(checked === true)}
            />
            Только проверить
          </Text>
          <Button
            type="button"
            size="1"
            disabled={!importFile || importConfiguration.isPending}
            onClick={() => {
              if (!importFile) return;
              const format = importFile.name.toLowerCase().endsWith(".xml")
                ? "xml"
                : "csv";
              void importFile
                .text()
                .then((content) =>
                  importConfiguration.mutate({ format, content, dryRun }),
                );
            }}
          >
            <Upload size={14} /> {dryRun ? "Проверить" : "Импортировать"}
          </Button>
        </Flex>
        {importConfiguration.data && (
          <div className="mt-2 grid gap-1" role="status">
            {importConfiguration.data.rows.map((row) => (
              <Text
                key={`${row.row}-${row.extension ?? "empty"}`}
                size="1"
                color={row.status === "rejected" ? "red" : "green"}
              >
                Строка {row.row}:{" "}
                {row.status === "created"
                  ? "будет создано"
                  : row.status === "updated"
                    ? "будет обновлено"
                    : "отклонено"}
                {row.extension ? `, номер ${row.extension}` : ""}
                {row.reason ? ` — ${row.reason}` : ""}
              </Text>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
