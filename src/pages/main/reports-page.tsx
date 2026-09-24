import {
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Select,
  Skeleton,
  Tabs,
  Text,
  TextField,
  toast,
} from "@bolid-ui/themes";
import { AlertTriangle, Download, FileChartColumn, Search } from "lucide-react";
import { useState, type FormEvent } from "react";

import { ReportAttemptsTable } from "../../components/reports/report-attempts-table";
import { ReportStudentsTable } from "../../components/reports/report-students-table";
import { ReportSummary } from "../../components/reports/report-summary";
import { InstructorDdsSummary } from "../../components/reports/instructor-dds-summary";
import { ReportAnalytics } from "../../components/reports/report-analytics";
import { TrainingField } from "../../components/training/training-field";
import type {
  InstructorReportFilters,
  ReportFormat,
  ReportScope,
} from "../../contracts/reports";
import { useInstructorReport } from "../../hooks/use-reports";
import { useStudents, useTrainingGroups } from "../../hooks/use-training";
import { reportsService } from "../../services/reports.service";

const dayBoundary = (date: string, end: boolean): string | undefined =>
  date
    ? new Date(`${date}T${end ? "23:59:59.999" : "00:00:00"}`).toISOString()
    : undefined;

export default function ReportsPage() {
  const groups = useTrainingGroups();
  const students = useStudents();
  const [scope, setScope] = useState<ReportScope>("group");
  const [targetId, setTargetId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [applied, setApplied] = useState<InstructorReportFilters | null>(null);
  const [downloading, setDownloading] = useState<ReportFormat | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const report = useInstructorReport(applied);

  const changeScope = (next: ReportScope) => {
    setScope(next);
    setTargetId("");
    setApplied(null);
    setValidationError(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!targetId) {
      setValidationError(
        scope === "group" ? "Выберите группу" : "Выберите ученика",
      );
      return;
    }
    if (from && to && from > to) {
      setValidationError("Начало периода не может быть позже окончания");
      return;
    }

    const period = {
      from: dayBoundary(from, false),
      to: dayBoundary(to, true),
    };
    setValidationError(null);
    setDownloadError(null);
    setApplied(
      scope === "group"
        ? { scope, groupId: targetId, ...period }
        : { scope, operatorId: targetId, ...period },
    );
  };

  const download = async (format: ReportFormat) => {
    if (!applied) return;
    setDownloading(format);
    setDownloadError(null);
    try {
      const filename = await reportsService.download(applied, format);
      toast.success("Отчёт сохранён", { description: filename });
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : "Не удалось скачать отчёт",
      );
    } finally {
      setDownloading(null);
    }
  };

  const targetError = groups.error ?? students.error;

  return (
    <main className="grid h-full min-h-0 content-start gap-4 overflow-auto p-4">
      <div>
        <Heading size="6">Отчёты преподавателя</Heading>
        <Text as="p" size="2" color="gray" mt="1">
          Анализируйте результаты ученика или группы и выгружайте один и тот же
          срез в CSV, XLSX или PDF.
        </Text>
      </div>

      <Card size="2" variant="surface">
        <form
          onSubmit={submit}
          className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-5"
        >
          <TrainingField label="Тип отчёта">
            <Select.Root
              value={scope}
              onValueChange={(value) => changeScope(value as ReportScope)}
            >
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="group">По группе</Select.Item>
                <Select.Item value="student">По ученику</Select.Item>
              </Select.Content>
            </Select.Root>
          </TrainingField>

          <TrainingField label={scope === "group" ? "Группа" : "Ученик"}>
            <Select.Root value={targetId} onValueChange={setTargetId}>
              <Select.Trigger
                placeholder={
                  scope === "group" ? "Выберите группу" : "Выберите ученика"
                }
              />
              <Select.Content>
                {scope === "group"
                  ? (groups.data ?? []).map((group) => (
                      <Select.Item key={group.id} value={group.id}>
                        {group.name} · {group.code}
                      </Select.Item>
                    ))
                  : (students.data ?? []).map((student) => (
                      <Select.Item key={student.id} value={student.id}>
                        {student.fullName} · {student.email}
                      </Select.Item>
                    ))}
              </Select.Content>
            </Select.Root>
          </TrainingField>

          <TrainingField label="Период с">
            <TextField.Root
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
            />
          </TrainingField>

          <TrainingField label="Период по">
            <TextField.Root
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
            />
          </TrainingField>

          <Flex align="end">
            <Button
              type="submit"
              className="w-full"
              disabled={report.isFetching}
            >
              <Search size={16} />
              {report.isFetching ? "Формирование…" : "Сформировать"}
            </Button>
          </Flex>
        </form>
      </Card>

      {(validationError || targetError) && (
        <Callout.Root color="red" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>
            {validationError ??
              `Не удалось загрузить справочники: ${targetError?.message}`}
          </Callout.Text>
        </Callout.Root>
      )}

      {report.error && (
        <Callout.Root color="red" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>
            Не удалось сформировать отчёт: {report.error.message}
          </Callout.Text>
        </Callout.Root>
      )}

      {downloadError && (
        <Callout.Root color="red" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>Не удалось скачать отчёт: {downloadError}</Callout.Text>
        </Callout.Root>
      )}

      {report.isPending && applied && (
        <Skeleton height="360px" className="rounded-xl" />
      )}

      {!applied && (
        <Card size="3">
          <Flex direction="column" align="center" gap="2" py="6">
            <FileChartColumn size={32} />
            <Text weight="bold">Настройте отчёт</Text>
            <Text size="2" color="gray" align="center">
              Выберите группу или ученика. Период можно оставить пустым, чтобы
              включить все доступные попытки.
            </Text>
          </Flex>
        </Card>
      )}

      {report.data && (
        <>
          <Flex align="center" justify="between" gap="3" wrap="wrap">
            <div>
              <Heading size="4">{report.data.target.name}</Heading>
              <Text size="1" color="gray">
                Сформирован{" "}
                {new Date(report.data.generatedAt).toLocaleString("ru-RU")}
              </Text>
            </div>
            <Flex gap="2" wrap="wrap">
              {(["csv", "xlsx", "pdf"] as const).map((format) => (
                <Button
                  key={format}
                  type="button"
                  variant="soft"
                  disabled={downloading !== null}
                  onClick={() => void download(format)}
                >
                  <Download size={16} />
                  {downloading === format
                    ? "Скачивание…"
                    : format.toUpperCase()}
                </Button>
              ))}
            </Flex>
          </Flex>

          <Callout.Root color="amber">
            <Callout.Icon>
              <AlertTriangle size={16} />
            </Callout.Icon>
            <Callout.Text>{report.data.grammar.message}</Callout.Text>
          </Callout.Root>

          <ReportSummary report={report.data} />
          <InstructorDdsSummary dds={report.data.dds} />
          {report.data.analytics && (
            <ReportAnalytics analytics={report.data.analytics} />
          )}

          <Tabs.Root defaultValue="attempts">
            <Tabs.List>
              <Tabs.Trigger value="attempts">
                Попытки · {report.data.attempts.length}
              </Tabs.Trigger>
              {report.data.scope === "group" && (
                <Tabs.Trigger value="students">
                  Ученики · {report.data.students.length}
                </Tabs.Trigger>
              )}
            </Tabs.List>
            <Tabs.Content value="attempts" className="pt-4">
              <ReportAttemptsTable attempts={report.data.attempts} />
            </Tabs.Content>
            {report.data.scope === "group" && (
              <Tabs.Content value="students" className="pt-4">
                <ReportStudentsTable students={report.data.students} />
              </Tabs.Content>
            )}
          </Tabs.Root>
        </>
      )}
    </main>
  );
}
