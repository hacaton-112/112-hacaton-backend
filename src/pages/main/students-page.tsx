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
} from "@bolid-ui/themes";
import { AlertTriangle, ArrowRight, Eye, Pencil, UserPlus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import { StudentCreateDialog } from "../../components/training/student-create-dialog";
import { StudentEditDialog } from "../../components/training/student-edit-dialog";
import {
  formatDateTime,
  formatDuration,
  formatScore,
} from "../../components/training/training-labels";
import { canCreateUsers } from "../../config/roles";
import { ROUTES } from "../../config/routes";
import type { StudentListItem } from "../../contracts/training";
import {
  useStudents,
  useTrainingGroups,
  useTrainingMutations,
} from "../../hooks/use-training";
import {
  ACTION_COLUMN,
  DATA_TABLE_DEFAULTS,
  menuIcon,
} from "../../lib/data-table";
import { useAuthStore } from "../../stores/auth.store";

/**
 * Все ученики одной таблицей: исключённый из группы не пропадает из вида.
 * Группы и успеваемость у преподавателя — только по его группам и занятиям.
 */
export default function StudentsPage() {
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const isAdmin = canCreateUsers(role);
  const students = useStudents();
  const groups = useTrainingGroups();
  const mutations = useTrainingMutations();
  const [createOpen, setCreateOpen] = useState(false);
  const [studentToEdit, setStudentToEdit] = useState<StudentListItem>();

  // Службу можно поправить, только когда группа однозначна; иначе — учётную
  // запись, а это делает администратор.
  const soleGroup = (student: StudentListItem) =>
    student.groups.length === 1 ? student.groups[0] : undefined;
  const canEdit = (student: StudentListItem) =>
    isAdmin || soleGroup(student) !== undefined;

  const openEditor = (student: StudentListItem) => {
    mutations.updateStudent.reset();
    setStudentToEdit(student);
  };

  const getContextMenuItems = ({
    node,
  }: GetContextMenuItemsParams<StudentListItem>): (
    DefaultMenuItem | MenuItemDef<StudentListItem>
  )[] => {
    const student = node?.data;
    if (!student) return [];
    return [
      {
        name: "Открыть ученика",
        icon: menuIcon(Eye),
        action: () => navigate(ROUTES.student(student.id)),
      },
      ...(canEdit(student)
        ? [
            {
              name: "Редактировать",
              icon: menuIcon(Pencil),
              action: () => openEditor(student),
            },
          ]
        : []),
    ];
  };

  const columnDefs: ColDef<StudentListItem>[] = [
    { field: "fullName", headerName: "Ученик", flex: 2, minWidth: 200 },
    { field: "email", headerName: "Email", flex: 2, minWidth: 200 },
    {
      colId: "groups",
      headerName: "Группы",
      flex: 2,
      minWidth: 200,
      valueGetter: ({ data }) =>
        data?.groups.map(({ groupName }) => groupName).join(", ") ?? "",
      cellRenderer: ({ data }: ICellRendererParams<StudentListItem>) =>
        data && data.groups.length === 0 ? (
          <Text color="gray">Без группы</Text>
        ) : (
          <Flex align="center" gap="1" wrap="wrap" className="h-full">
            {data?.groups.map((group) => (
              <Badge key={group.groupId} variant="soft">
                {group.groupName} · {group.serviceTag}
              </Badge>
            ))}
          </Flex>
        ),
    },
    {
      colId: "attempts",
      headerName: "Попыток",
      minWidth: 100,
      valueGetter: ({ data }) => data?.stats.attempts,
    },
    {
      colId: "averageScore",
      headerName: "Средний балл",
      minWidth: 130,
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
      minWidth: 120,
      valueGetter: ({ data }) => data?.stats.averageAnswerSeconds ?? null,
      valueFormatter: ({ value }) =>
        value === null ? "—" : formatDuration(value),
    },
    {
      colId: "lastAttemptAt",
      headerName: "Последний звонок",
      minWidth: 160,
      valueGetter: ({ data }) => data?.stats.lastAttemptAt ?? null,
      valueFormatter: ({ value }) => (value ? formatDateTime(value) : "—"),
    },
    {
      ...ACTION_COLUMN,
      width: 140,
      cellRenderer: ({ data }: ICellRendererParams<StudentListItem>) =>
        data && (
          <Flex align="center" justify="center" className="h-full">
            <Button
              size="1"
              variant="soft"
              onClick={() => navigate(ROUTES.student(data.id))}
            >
              Перейти <ArrowRight size={14} />
            </Button>
          </Flex>
        ),
    },
  ];

  const editedGroup = studentToEdit && soleGroup(studentToEdit);

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4 md:p-6">
      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <div>
          <Heading size="6">Ученики</Heading>
          <Text as="p" size="2" color="gray">
            Все ученики, в том числе без группы. Успеваемость — по вашим
            занятиям.
          </Text>
        </div>
        {isAdmin && (
          <Button
            onClick={() => {
              mutations.createStudent.reset();
              setCreateOpen(true);
            }}
          >
            <UserPlus size={16} /> Создать ученика
          </Button>
        )}
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
          <DataTableReact<StudentListItem>
            {...DATA_TABLE_DEFAULTS}
            rowData={students.data ?? []}
            columnDefs={columnDefs}
            getRowId={({ data }) => data.id}
            getContextMenuItems={getContextMenuItems}
          />
        )}
      </div>

      <StudentCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        groups={groups.data ?? []}
        mutations={mutations}
      />
      <StudentEditDialog
        open={studentToEdit !== undefined}
        onOpenChange={(open) => !open && setStudentToEdit(undefined)}
        groupId={editedGroup?.groupId}
        student={
          studentToEdit && {
            userId: studentToEdit.id,
            fullName: studentToEdit.fullName,
            email: studentToEdit.email,
            serviceTag: editedGroup?.serviceTag,
          }
        }
        mutations={mutations}
      />
    </main>
  );
}
