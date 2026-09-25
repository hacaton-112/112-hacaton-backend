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
  Flex,
  Heading,
  IconButton,
  Skeleton,
  Tabs,
  Text,
  toast,
} from "@bolid-ui/themes";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowRight,
  Eye,
  FileSpreadsheet,
  Pencil,
  Plus,
  Trash2,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { GroupAnalyticsTab } from "../../components/training/group-analytics-tab";
import { LiveSessionsPanel } from "../../components/training/live-sessions-panel";
import { MemberAddDialog } from "../../components/training/member-add-dialog";
import { GroupFormDialog } from "../../components/training/group-form-dialog";
import { StudentEditDialog } from "../../components/training/student-edit-dialog";
import { StudentCreateDialog } from "../../components/training/student-create-dialog";
import { TrainingAssignmentsPanel } from "../../components/training/training-assignments-panel";
import { Breadcrumbs } from "../../components/ui/breadcrumbs";
import { TrainingConfirmDialog } from "../../components/training/training-confirm-dialog";
import {
  formatDateTime,
  formatDuration,
  formatScore,
} from "../../components/training/training-labels";
import { canCreateStudents } from "../../config/roles";
import { ROUTES } from "../../config/routes";
import {
  isAssignmentForTarget,
  type GroupStudent,
  type TrainingGroup,
} from "../../contracts/training";
import {
  useGroupStudents,
  useLiveTrainingSessions,
  useTrainingAssignments,
  useTrainingGroup,
  useTrainingGroups,
  useTrainingMutations,
  type TrainingMutations,
} from "../../hooks/use-training";
import {
  ACTION_COLUMN,
  DATA_TABLE_DEFAULTS,
  menuIcon,
} from "../../lib/data-table";
import {
  downloadFile,
  generateGroupProtocolCsv,
} from "../../lib/group-protocol-export";
import { useAuthStore } from "../../stores/auth.store";

/** Группа: её ученики с успеваемостью, занятия и идущие звонки. */
export default function GroupPage() {
  const { groupId = "" } = useParams();
  const group = useTrainingGroup(groupId);
  const mutations = useTrainingMutations();

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4 md:p-6">
      <Breadcrumbs
        items={[
          { label: "Группы", to: ROUTES.groups() },
          {
            label: group.data
              ? `${group.data.name} (${group.data.code})`
              : "Группа",
          },
        ]}
      />

      {group.error && !group.data && (
        <Callout.Root color="red" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>
            Не удалось открыть группу: {group.error.message}
          </Callout.Text>
        </Callout.Root>
      )}

      {group.isPending && (
        <Skeleton height="320px" className="rounded-(--radius-4)" />
      )}

      {group.data && <GroupContent group={group.data} mutations={mutations} />}
    </main>
  );
}

function GroupContent({
  group,
  mutations,
}: {
  group: TrainingGroup;
  mutations: TrainingMutations;
}) {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const liveSessions = useLiveTrainingSessions(group.id);
  const liveCount = liveSessions.data?.length ?? 0;
  const isActive = group.status === "active";

  const students = useGroupStudents(group.id);
  const allAssignments = useTrainingAssignments();
  const groupAssignments = useMemo(
    () =>
      (allAssignments.data ?? []).filter((assignment) =>
        isAssignmentForTarget(assignment, { kind: "group", group }),
      ),
    [allAssignments.data, group],
  );

  const handleExportProtocol = () => {
    const csvContent = generateGroupProtocolCsv({
      group,
      students: students.data ?? [],
      assignments: groupAssignments,
      instructorName: currentUser?.fullName,
    });
    const filename = `protocol_${group.code || group.id}_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadFile(csvContent, filename);
    toast.success("Протокол группы экспортирован в Excel / CSV");
  };

  const setStatus = async (status: TrainingGroup["status"]) => {
    try {
      await mutations.updateGroup.mutateAsync({ groupId: group.id, status });
      toast.success(
        status === "archived" ? "Группа в архиве" : "Группа снова активна",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось изменить группу",
      );
    }
  };

  const deleteGroup = async () => {
    try {
      await mutations.deleteGroup.mutateAsync(group.id);
      toast.success("Группа удалена");
      navigate(ROUTES.groups(), { replace: true });
    } catch {
      // Причина остаётся в диалоге: у группы могут быть занятия.
    }
  };

  return (
    <>
      <Flex align="start" justify="between" gap="3" wrap="wrap">
        <div>
          <Flex align="center" gap="2">
            <Heading size="6">{group.name}</Heading>
            <Badge color={isActive ? "green" : "gray"}>
              {isActive ? "Активна" : "В архиве"}
            </Badge>
          </Flex>
          <Text as="p" size="2" color="gray">
            {group.code} · {group.organization} · {group.members.length} уч.
          </Text>
        </div>
        <Flex gap="2" wrap="wrap">
          <Button
            variant="soft"
            color="green"
            onClick={handleExportProtocol}
            title="Экспорт ведомости и протокола группы в Excel (CSV)"
          >
            <FileSpreadsheet size={16} /> Экспорт отчёта
          </Button>
          <Button
            variant="soft"
            onClick={() => {
              mutations.updateGroup.reset();
              setEditOpen(true);
            }}
          >
            <Pencil size={16} /> Редактировать
          </Button>
          {isActive ? (
            <Button
              variant="soft"
              color="gray"
              disabled={mutations.updateGroup.isPending}
              onClick={() => void setStatus("archived")}
            >
              <Archive size={16} /> В архив
            </Button>
          ) : (
            <Button
              variant="soft"
              disabled={mutations.updateGroup.isPending}
              onClick={() => void setStatus("active")}
            >
              <ArchiveRestore size={16} /> Вернуть из архива
            </Button>
          )}
          <Button
            variant="soft"
            color="red"
            onClick={() => {
              mutations.deleteGroup.reset();
              setDeleteOpen(true);
            }}
          >
            <Trash2 size={16} /> Удалить
          </Button>
        </Flex>
      </Flex>

      <Tabs.Root
        defaultValue="students"
        className="flex min-h-0 flex-1 flex-col"
      >
        <Tabs.List size="2">
          <Tabs.Trigger value="students">Ученики</Tabs.Trigger>
          <Tabs.Trigger value="assignments">Занятия</Tabs.Trigger>
          <Tabs.Trigger value="analytics">Аналитика</Tabs.Trigger>
          <Tabs.Trigger value="live">
            Идут звонки
            {liveCount > 0 && (
              <Badge color="green" ml="2">
                {liveCount}
              </Badge>
            )}
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content
          value="students"
          className="flex min-h-0 flex-1 flex-col pt-4"
        >
          <GroupStudents group={group} mutations={mutations} />
        </Tabs.Content>
        <Tabs.Content
          value="assignments"
          className="flex min-h-0 flex-1 flex-col pt-4"
        >
          <TrainingAssignmentsPanel
            target={{ kind: "group", group }}
            mutations={mutations}
          />
        </Tabs.Content>
        <Tabs.Content
          value="analytics"
          className="flex min-h-0 flex-1 flex-col pt-4"
        >
          <GroupAnalyticsTab
            group={group}
            students={students.data ?? []}
            assignments={groupAssignments}
            instructorName={currentUser?.fullName}
          />
        </Tabs.Content>
        <Tabs.Content value="live" className="pt-4">
          <LiveSessionsPanel groupId={group.id} mutations={mutations} />
        </Tabs.Content>
      </Tabs.Root>

      <GroupFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        group={group}
        mutations={mutations}
      />
      <TrainingConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Удалить группу?"
        description={
          <>
            <strong>{group.name}</strong> и её состав будут удалены. Группу с
            занятиями удалить нельзя — её архивируют, чтобы сохранить историю
            попыток.
          </>
        }
        confirmLabel="Удалить"
        pending={mutations.deleteGroup.isPending}
        error={mutations.deleteGroup.error?.message}
        onConfirm={() => void deleteGroup()}
      />
    </>
  );
}

function GroupStudents({
  group,
  mutations,
}: {
  group: TrainingGroup;
  mutations: TrainingMutations;
}) {
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const students = useGroupStudents(group.id);
  const groups = useTrainingGroups();
  const [addOpen, setAddOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const isActive = group.status === "active";

  const [memberToRemove, setMemberToRemove] = useState<GroupStudent>();
  const [memberToEdit, setMemberToEdit] = useState<GroupStudent>();

  const askRemoval = (student: GroupStudent) => {
    mutations.removeMember.reset();
    setMemberToRemove(student);
  };

  const removeMember = async () => {
    if (!memberToRemove) return;
    try {
      await mutations.removeMember.mutateAsync({
        groupId: group.id,
        userId: memberToRemove.userId,
      });
      toast.success("Ученик исключён из группы", {
        description: memberToRemove.fullName,
      });
      setMemberToRemove(undefined);
    } catch {
      // Причина остаётся в диалоге.
    }
  };

  const getContextMenuItems = ({
    node,
  }: GetContextMenuItemsParams<GroupStudent>): (
    DefaultMenuItem | MenuItemDef<GroupStudent>
  )[] => {
    const student = node?.data;
    if (!student) return [];
    return [
      {
        name: "Открыть ученика",
        icon: menuIcon(Eye),
        action: () => navigate(ROUTES.groupStudent(group.id, student.userId)),
      },
      {
        name: "Редактировать",
        icon: menuIcon(Pencil),
        action: () => {
          mutations.updateStudent.reset();
          setMemberToEdit(student);
        },
      },
      "separator",
      {
        name: "Исключить из группы",
        icon: menuIcon(UserMinus),
        action: () => askRemoval(student),
      },
    ];
  };

  const columnDefs: ColDef<GroupStudent>[] = [
    { field: "fullName", headerName: "Ученик", flex: 2, minWidth: 200 },
    { field: "email", headerName: "Email", flex: 2, minWidth: 200 },
    {
      field: "serviceTag",
      headerName: "Служба",
      minWidth: 130,
      cellRenderer: ({ value }: ICellRendererParams<GroupStudent>) => (
        <Badge variant="soft">{value}</Badge>
      ),
    },
    {
      colId: "attempts",
      headerName: "Попыток",
      minWidth: 110,
      valueGetter: ({ data }) => data?.stats.attempts,
    },
    {
      colId: "averageScore",
      headerName: "Средний балл",
      minWidth: 140,
      valueGetter: ({ data }) => data?.stats.averageScore ?? null,
      valueFormatter: ({ value }) => formatScore(value),
    },
    {
      colId: "passed",
      headerName: "Сдано",
      minWidth: 100,
      valueGetter: ({ data }) =>
        data ? `${data.stats.passedCalls} / ${data.stats.evaluatedCalls}` : "",
      headerTooltip: "Звонков выше порога / оценённых звонков",
    },
    {
      colId: "averageAnswer",
      headerName: "Ответ, сред.",
      minWidth: 130,
      valueGetter: ({ data }) => data?.stats.averageAnswerSeconds ?? null,
      valueFormatter: ({ value }) =>
        value === null ? "—" : formatDuration(value),
    },
    {
      colId: "lastAttemptAt",
      headerName: "Последний звонок",
      minWidth: 170,
      valueGetter: ({ data }) => data?.stats.lastAttemptAt ?? null,
      valueFormatter: ({ value }) => (value ? formatDateTime(value) : "—"),
    },
    {
      ...ACTION_COLUMN,
      width: 170,
      cellRenderer: ({ data }: ICellRendererParams<GroupStudent>) =>
        data && (
          <Flex align="center" justify="center" gap="2" className="h-full">
            <Button
              size="1"
              variant="soft"
              onClick={() =>
                navigate(ROUTES.groupStudent(group.id, data.userId))
              }
            >
              Перейти <ArrowRight size={14} />
            </Button>
            <IconButton
              size="1"
              variant="ghost"
              color="red"
              aria-label={`Исключить ${data.fullName}`}
              title="Исключить из группы"
              disabled={mutations.removeMember.isPending}
              onClick={() => askRemoval(data)}
            >
              <UserMinus size={14} />
            </IconButton>
          </Flex>
        ),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Flex align="center" justify="between" gap="3">
        <Text size="2" color="gray">
          Балл учитывает звонки, по которым уже есть оценка.
        </Text>
        <Flex gap="2" className="shrink-0">
          {canCreateStudents(role) && (
            <Button
              variant="soft"
              disabled={!isActive}
              onClick={() => {
                mutations.createStudent.reset();
                setCreateOpen(true);
              }}
            >
              <UserPlus size={16} /> Создать ученика
            </Button>
          )}
          <Button
            disabled={!isActive}
            onClick={() => {
              mutations.addMember.reset();
              setAddOpen(true);
            }}
          >
            <Plus size={16} /> Добавить в группу
          </Button>
        </Flex>
      </Flex>

      {students.error && !students.data && (
        <Callout.Root color="red" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>
            Не удалось получить учеников: {students.error.message}
          </Callout.Text>
        </Callout.Root>
      )}

      <div className="min-h-80 flex-1">
        {students.isPending ? (
          <Skeleton height="100%" className="rounded-(--radius-4)" />
        ) : (
          <DataTableReact<GroupStudent>
            {...DATA_TABLE_DEFAULTS}
            rowData={students.data ?? []}
            columnDefs={columnDefs}
            getRowId={({ data }) => data.userId}
            getContextMenuItems={getContextMenuItems}
          />
        )}
      </div>

      <TrainingConfirmDialog
        open={memberToRemove !== undefined}
        onOpenChange={(open) => !open && setMemberToRemove(undefined)}
        title="Исключить ученика из группы?"
        description={
          <>
            <strong>{memberToRemove?.fullName}</strong> больше не увидит занятия
            группы. Учётная запись и проведённые звонки сохранятся.
          </>
        }
        confirmLabel="Исключить"
        pending={mutations.removeMember.isPending}
        error={mutations.removeMember.error?.message}
        onConfirm={() => void removeMember()}
      />
      <StudentEditDialog
        open={memberToEdit !== undefined}
        onOpenChange={(open) => !open && setMemberToEdit(undefined)}
        groupId={group.id}
        student={memberToEdit}
        mutations={mutations}
      />
      <MemberAddDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        group={group}
        mutations={mutations}
      />
      <StudentCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        groups={groups.data ?? [group]}
        groupId={group.id}
        mutations={mutations}
      />
    </div>
  );
}
