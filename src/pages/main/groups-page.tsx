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
  Skeleton,
  Text,
  toast,
} from "@bolid-ui/themes";
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  Pencil,
  Plus,
  Trash2,
  UserMinus,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { GroupFormDialog } from "../../components/training/group-form-dialog";
import { ReadinessBadge } from "../../components/reports/readiness-card";
import { StudentEditDialog } from "../../components/training/student-edit-dialog";
import { StudentCreateDialog } from "../../components/training/student-create-dialog";
import { TrainingConfirmDialog } from "../../components/training/training-confirm-dialog";
import {
  formatDateTime,
  toGroupTableRows,
  type GroupTableRow,
} from "../../components/training/training-labels";
import { ROUTES } from "../../config/routes";
import {
  useTrainingGroups,
  useTrainingMutations,
} from "../../hooks/use-training";
import { useInstructorReadiness } from "../../hooks/use-reports";
import {
  ACTION_COLUMN,
  DATA_TABLE_DEFAULTS,
  menuIcon,
} from "../../lib/data-table";

/** Строка группы: название, код и число учеников. */
function GroupCell({ node }: ICellRendererParams<GroupTableRow>) {
  const row = node.allLeafChildren?.[0]?.data;
  if (!row) return null;

  return (
    <Flex align="center" gap="3" className="h-full">
      <Text weight="medium">{row.groupName}</Text>
      <Text size="1" color="gray">
        {row.groupCode} · {row.organization}
      </Text>
      <Badge variant="soft">{row.membersCount} уч.</Badge>
      {row.groupStatus === "archived" && <Badge color="gray">В архиве</Badge>}
    </Flex>
  );
}

/**
 * Переход из строки: у группы — на страницу группы, у ученика — на страницу
 * ученика в этой группе. У пустой строки группы без учеников кнопки нет.
 */
function RowActionCell({ node, data }: ICellRendererParams<GroupTableRow>) {
  const navigate = useNavigate();

  if (node.group) {
    const row = node.allLeafChildren?.[0]?.data;
    return row ? (
      <Flex align="center" justify="center" className="h-full">
        <Button
          size="1"
          variant="soft"
          onClick={() => navigate(ROUTES.group(row.groupId))}
        >
          Перейти <ArrowRight size={14} />
        </Button>
      </Flex>
    ) : null;
  }

  if (!data?.student) return null;
  const { student, groupId } = data;
  return (
    <Flex align="center" justify="center" className="h-full">
      <Button
        size="1"
        variant="soft"
        onClick={() => navigate(ROUTES.groupStudent(groupId, student.userId))}
      >
        Перейти <ArrowRight size={14} />
      </Button>
    </Flex>
  );
}

function GroupReadinessCell({ node, data }: ICellRendererParams<GroupTableRow>) {
  const row = node.group ? node.allLeafChildren?.[0]?.data : data;
  const readiness = useInstructorReadiness(
    row ? { scope: "group", groupId: row.groupId } : null,
  );
  if (readiness.isPending) return <Text size="1" color="gray">Расчёт…</Text>;
  if (!readiness.data) return <Text size="1" color="gray">—</Text>;
  return (
    <Flex align="center" className="h-full">
      <ReadinessBadge prediction={readiness.data.prediction} />
    </Flex>
  );
}

type PendingRemoval =
  | { kind: "group"; row: GroupTableRow }
  | {
      kind: "member";
      row: GroupTableRow & { student: GroupTableRow["student"] & {} };
    };

/** Группы и их ученики одной таблицей; группа раскрывается в список учеников. */
export default function GroupsPage() {
  const groups = useTrainingGroups();
  const mutations = useTrainingMutations();
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [studentDialogOpen, setStudentDialogOpen] = useState(false);
  const [removal, setRemoval] = useState<PendingRemoval>();
  const [groupToEdit, setGroupToEdit] = useState<GroupTableRow>();
  const [memberToEdit, setMemberToEdit] = useState<{
    groupId: string;
    member: NonNullable<GroupTableRow["student"]>;
  }>();
  const navigate = useNavigate();

  // Правый клик по строке: на группе — действия с группой, на ученике — с
  // учеником в этой группе.
  const getContextMenuItems = useCallback(
    ({
      node,
    }: GetContextMenuItemsParams<GroupTableRow>): (
      DefaultMenuItem | MenuItemDef<GroupTableRow>
    )[] => {
      const row = node?.group ? node.allLeafChildren?.[0]?.data : node?.data;
      if (!row) return [];

      if (!node?.group && row.student) {
        const student = row.student;
        return [
          {
            name: "Открыть ученика",
            icon: menuIcon(Eye),
            action: () =>
              navigate(ROUTES.groupStudent(row.groupId, student.userId)),
          },
          {
            name: "Редактировать",
            icon: menuIcon(Pencil),
            action: () => {
              mutations.updateStudent.reset();
              setMemberToEdit({ groupId: row.groupId, member: student });
            },
          },
          "separator",
          {
            name: "Исключить из группы",
            icon: menuIcon(UserMinus),
            action: () => {
              mutations.removeMember.reset();
              setRemoval({ kind: "member", row: { ...row, student } });
            },
          },
        ];
      }

      return [
        {
          name: "Открыть группу",
          icon: menuIcon(ArrowRight),
          action: () => navigate(ROUTES.group(row.groupId)),
        },
        {
          name: "Редактировать",
          icon: menuIcon(Pencil),
          action: () => {
            mutations.updateGroup.reset();
            setGroupToEdit(row);
          },
        },
        "separator",
        {
          name: "Удалить группу",
          icon: menuIcon(Trash2),
          action: () => {
            mutations.deleteGroup.reset();
            setRemoval({ kind: "group", row });
          },
        },
      ];
    },
    [
      mutations.deleteGroup,
      mutations.removeMember,
      mutations.updateGroup,
      mutations.updateStudent,
      navigate,
    ],
  );

  const confirmRemoval = async () => {
    if (!removal) return;
    try {
      if (removal.kind === "group") {
        await mutations.deleteGroup.mutateAsync(removal.row.groupId);
        toast.success("Группа удалена", { description: removal.row.groupName });
      } else {
        await mutations.removeMember.mutateAsync({
          groupId: removal.row.groupId,
          userId: removal.row.student.userId,
        });
        toast.success("Ученик исключён из группы", {
          description: removal.row.student.fullName,
        });
      }
      setRemoval(undefined);
    } catch {
      // Причина остаётся в диалоге: например, у группы есть занятия.
    }
  };
  const removalMutation =
    removal?.kind === "member" ? mutations.removeMember : mutations.deleteGroup;
  const rows = useMemo(
    () => toGroupTableRows(groups.data ?? []),
    [groups.data],
  );

  const columnDefs = useMemo<ColDef<GroupTableRow>[]>(
    () => [
      { field: "groupName", headerName: "Группа", rowGroup: true, hide: true },
      {
        colId: "fullName",
        headerName: "Ученик",
        flex: 2,
        minWidth: 200,
        valueGetter: ({ data }) => data?.student?.fullName ?? null,
        cellRenderer: ({ data, value }: ICellRendererParams<GroupTableRow>) =>
          data && !data.student ? (
            <Text color="gray">Учеников пока нет</Text>
          ) : (
            value
          ),
      },
      {
        colId: "email",
        headerName: "Email",
        flex: 2,
        minWidth: 200,
        valueGetter: ({ data }) => data?.student?.email ?? null,
      },
      {
        colId: "serviceTag",
        headerName: "Служба",
        flex: 1,
        minWidth: 130,
        valueGetter: ({ data }) => data?.student?.serviceTag ?? null,
        cellRenderer: ({ value }: ICellRendererParams<GroupTableRow>) =>
          value ? <Badge variant="soft">{value}</Badge> : null,
      },
      {
        colId: "joinedAt",
        headerName: "В группе с",
        flex: 1,
        minWidth: 150,
        valueGetter: ({ data }) => data?.student?.joinedAt ?? null,
        valueFormatter: ({ value }) => (value ? formatDateTime(value) : ""),
      },
      {
        colId: "readiness",
        headerName: "Готовность группы",
        minWidth: 210,
        sortable: false,
        cellRenderer: GroupReadinessCell,
      },
      {
        ...ACTION_COLUMN,
        width: 140,
        cellRenderer: RowActionCell,
      },
    ],
    [],
  );

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4 md:p-6">
      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <div>
          <Heading size="6">Группы</Heading>
          <Text as="p" size="2" color="gray">
            Раскройте группу, чтобы увидеть учеников, или перейдите в неё к
            занятиям и статистике.
          </Text>
        </div>
        <Flex gap="2">
          <Button
            onClick={() => {
              mutations.createGroup.reset();
              setGroupDialogOpen(true);
            }}
          >
            <Plus size={16} /> Создать группу
          </Button>
        </Flex>
      </Flex>

      {groups.error && !groups.data && (
        <Callout.Root color="red" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>
            Не удалось получить группы: {groups.error.message}
          </Callout.Text>
        </Callout.Root>
      )}

      <div className="min-h-80 flex-1">
        {groups.isPending ? (
          <Skeleton height="100%" className="rounded-(--radius-4)" />
        ) : (
          <DataTableReact<GroupTableRow>
            {...DATA_TABLE_DEFAULTS}
            rowData={rows}
            columnDefs={columnDefs}
            getRowId={({ data }) => data.rowId}
            getContextMenuItems={getContextMenuItems}
            groupDefaultExpanded={-1}
            autoGroupColumnDef={{
              headerName: "Группа",
              flex: 3,
              minWidth: 320,
              cellRendererParams: {
                suppressCount: true,
                innerRenderer: GroupCell,
              },
            }}
          />
        )}
      </div>

      <GroupFormDialog
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        mutations={mutations}
      />
      <GroupFormDialog
        open={groupToEdit !== undefined}
        onOpenChange={(open) => !open && setGroupToEdit(undefined)}
        group={groups.data?.find(({ id }) => id === groupToEdit?.groupId)}
        mutations={mutations}
      />
      <StudentEditDialog
        open={memberToEdit !== undefined}
        onOpenChange={(open) => !open && setMemberToEdit(undefined)}
        groupId={memberToEdit?.groupId ?? ""}
        student={memberToEdit?.member}
        mutations={mutations}
      />
      <StudentCreateDialog
        open={studentDialogOpen}
        onOpenChange={setStudentDialogOpen}
        groups={groups.data ?? []}
        mutations={mutations}
      />
      <TrainingConfirmDialog
        open={removal !== undefined}
        onOpenChange={(open) => !open && setRemoval(undefined)}
        title={
          removal?.kind === "member"
            ? "Исключить ученика из группы?"
            : "Удалить группу?"
        }
        description={
          removal?.kind === "member" ? (
            <>
              <strong>{removal.row.student.fullName}</strong> больше не увидит
              занятия группы «{removal.row.groupName}». Учётная запись и
              проведённые звонки сохранятся.
            </>
          ) : (
            <>
              <strong>{removal?.row.groupName}</strong> и её состав будут
              удалены. Группу с занятиями удалить нельзя — её архивируют, чтобы
              сохранить историю попыток.
            </>
          )
        }
        confirmLabel={removal?.kind === "member" ? "Исключить" : "Удалить"}
        pending={removalMutation.isPending}
        error={removalMutation.error?.message}
        onConfirm={() => void confirmRemoval()}
      />
    </main>
  );
}
