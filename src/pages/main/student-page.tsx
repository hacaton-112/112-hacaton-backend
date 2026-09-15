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
  Skeleton,
  Tabs,
  Text,
} from "@bolid-ui/themes";
import { AlertTriangle, ArrowLeft, FileSearch } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router";

import { TrainingAssignmentsPanel } from "../../components/training/training-assignments-panel";
import {
  ATTEMPT_STATUS_COLORS,
  ATTEMPT_STATUS_LABELS,
  callVerdict,
  formatDateTime,
  formatDuration,
  formatScore,
} from "../../components/training/training-labels";
import { ROUTES } from "../../config/routes";
import type { InstructorCall, StudentProfile } from "../../contracts/training";
import {
  useStudentProfile,
  useTrainingMutations,
} from "../../hooks/use-training";
import { ACTION_COLUMN, DATA_TABLE_DEFAULTS } from "../../lib/data-table";

/** Ученик: успеваемость по всем занятиям и разборы его звонков. */
export default function StudentPage() {
  const { groupId, userId = "" } = useParams();
  const navigate = useNavigate();
  const profile = useStudentProfile(userId);

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4">
      <Button
        variant="ghost"
        color="gray"
        className="self-start"
        onClick={() =>
          navigate(groupId ? ROUTES.group(groupId) : ROUTES.students())
        }
      >
        <ArrowLeft size={16} /> {groupId ? "К группе" : "Все ученики"}
      </Button>

      {profile.error && !profile.data && (
        <Callout.Root color="red" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>
            Не удалось открыть ученика: {profile.error.message}
          </Callout.Text>
        </Callout.Root>
      )}

      {profile.isPending && <Skeleton height="360px" className="rounded-xl" />}

      {profile.data && <StudentContent profile={profile.data} />}
    </main>
  );
}

function StudentContent({ profile }: { profile: StudentProfile }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { student, stats, calls } = profile;
  const mutations = useTrainingMutations();

  const tiles = [
    { label: "Попыток", value: String(stats.attempts) },
    { label: "Завершено", value: String(stats.completedAttempts) },
    { label: "Средний балл", value: formatScore(stats.averageScore) },
    { label: "Лучший балл", value: formatScore(stats.bestScore) },
    {
      label: "Сдано выше порога",
      value: `${stats.passedCalls} из ${stats.evaluatedCalls}`,
    },
    {
      label: "Время ответа, сред.",
      value:
        stats.averageAnswerSeconds === null
          ? "—"
          : formatDuration(stats.averageAnswerSeconds),
    },
  ];

  const columnDefs: ColDef<InstructorCall>[] = [
    {
      field: "offeredAt",
      headerName: "Дата",
      minWidth: 160,
      sort: "desc",
      valueFormatter: ({ value }) => formatDateTime(value),
    },
    { field: "assignmentTitle", headerName: "Занятие", flex: 2, minWidth: 180 },
    {
      colId: "scenario",
      headerName: "Сценарий",
      flex: 2,
      minWidth: 180,
      valueGetter: ({ data }) =>
        data ? `${data.scenarioCode} · ${data.title}` : null,
    },
    { field: "groupName", headerName: "Группа", flex: 1, minWidth: 140 },
    {
      field: "attemptNumber",
      headerName: "Попытка",
      minWidth: 100,
      valueFormatter: ({ value }) => `№ ${value}`,
    },
    {
      field: "attemptStatus",
      headerName: "Статус",
      minWidth: 200,
      cellRenderer: ({ data }: ICellRendererParams<InstructorCall>) =>
        data && (
          <Badge color={ATTEMPT_STATUS_COLORS[data.attemptStatus]}>
            {ATTEMPT_STATUS_LABELS[data.attemptStatus]}
          </Badge>
        ),
    },
    {
      field: "durationSeconds",
      headerName: "Длительность",
      minWidth: 130,
      valueFormatter: ({ value }) =>
        value === null ? "—" : formatDuration(value),
    },
    {
      field: "score",
      headerName: "Балл",
      minWidth: 120,
      cellRenderer: ({ data }: ICellRendererParams<InstructorCall>) => {
        if (!data) return null;
        const verdict = callVerdict(data);
        return verdict === null ? (
          <Text color="gray">—</Text>
        ) : (
          <Badge color={verdict === "passed" ? "green" : "red"}>
            {data.score} / {data.passThreshold}
          </Badge>
        );
      },
    },
    {
      ...ACTION_COLUMN,
      width: 130,
      cellRenderer: ({ data }: ICellRendererParams<InstructorCall>) => {
        if (!data) return null;
        const isOver = data.stage === "ended" || data.stage === "declined";
        return (
          <Flex align="center" justify="center" className="h-full">
            <Button
              size="1"
              variant="soft"
              disabled={!isOver}
              title={isOver ? undefined : "Звонок ещё идёт"}
              onClick={() =>
                navigate(ROUTES.debriefSession(data.trainingSessionId), {
                  state: { backTo: location.pathname, backLabel: "К ученику" },
                })
              }
            >
              <FileSearch size={14} /> Разбор
            </Button>
          </Flex>
        );
      },
    },
  ];

  return (
    <>
      <div>
        <Heading size="6">{student.fullName}</Heading>
        <Flex align="center" gap="2" wrap="wrap" mt="1">
          <Text size="2" color="gray">
            {student.email}
          </Text>
          {student.groups.map((group) => (
            <Badge key={group.groupId} variant="soft">
              {group.groupName} · {group.serviceTag}
            </Badge>
          ))}
        </Flex>
        {stats.lastAttemptAt && (
          <Text as="p" size="1" color="gray" mt="1">
            Последний звонок {formatDateTime(stats.lastAttemptAt)}
          </Text>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((tile) => (
          <Card key={tile.label} size="2">
            <Text as="p" size="1" color="gray">
              {tile.label}
            </Text>
            <Text as="p" size="5" weight="bold">
              {tile.value}
            </Text>
          </Card>
        ))}
      </div>

      <Tabs.Root defaultValue="calls" className="flex min-h-0 flex-1 flex-col">
        <Tabs.List size="2">
          <Tabs.Trigger value="calls">Разборы</Tabs.Trigger>
          <Tabs.Trigger value="assignments">
            Индивидуальные занятия
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content
          value="calls"
          className="flex min-h-0 flex-1 flex-col pt-4"
        >
          <div className="min-h-80 flex-1">
            <DataTableReact<InstructorCall>
              {...DATA_TABLE_DEFAULTS}
              rowData={calls}
              columnDefs={columnDefs}
              getRowId={({ data }) => data.trainingSessionId}
            />
          </div>
        </Tabs.Content>
        <Tabs.Content
          value="assignments"
          className="flex min-h-0 flex-1 flex-col pt-4"
        >
          <TrainingAssignmentsPanel
            target={{
              kind: "student",
              student: { id: student.id, fullName: student.fullName },
            }}
            mutations={mutations}
          />
        </Tabs.Content>
      </Tabs.Root>
    </>
  );
}
