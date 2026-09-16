import { DataTableReact } from "@bolid-ui/data-table";
import type {
  ColDef,
  ICellRendererParams,
} from "@bolid-ui/data-table/community";
import {
  Badge,
  Button,
  Flex,
  IconButton,
  Skeleton,
  Text,
  toast,
} from "@bolid-ui/themes";
import { Archive, CircleStop, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  assignmentActions,
  isAssignmentForTarget,
  type AssignmentTarget,
  type CreateTrainingAssignment,
  type TrainingAssignment,
  type TrainingAssignmentSettings,
} from "../../contracts/training";
import { useScenarios } from "../../hooks/use-scenarios";
import {
  useTrainingAssignments,
  type TrainingMutations,
} from "../../hooks/use-training";
import { ACTION_COLUMN, DATA_TABLE_DEFAULTS } from "../../lib/data-table";
import { AssignmentFormDialog } from "./assignment-form-dialog";
import { TrainingConfirmDialog } from "./training-confirm-dialog";
import {
  ASSIGNMENT_STATUS_COLORS,
  ASSIGNMENT_STATUS_LABELS,
  CARD_SOURCE_LABELS,
  formatDateTime,
  formatDuration,
} from "./training-labels";

type Editor =
  { mode: "create" } | { mode: "edit"; assignment: TrainingAssignment };

type LifecycleAction = "launch" | "complete" | "archive";

/**
 * Занятия группы или индивидуальные занятия ученика и их жизненный цикл:
 * черновик, запуск, завершение, архив.
 */
export function TrainingAssignmentsPanel({
  target,
  mutations,
}: {
  target: AssignmentTarget;
  mutations: TrainingMutations;
}) {
  const scenarios = useScenarios();
  const assignments = useTrainingAssignments();
  const rows = useMemo(
    () =>
      (assignments.data ?? []).filter((assignment) =>
        isAssignmentForTarget(assignment, target),
      ),
    [assignments.data, target],
  );
  const [editor, setEditor] = useState<Editor>();
  const [assignmentToDelete, setAssignmentToDelete] =
    useState<TrainingAssignment>();
  const saving =
    editor?.mode === "edit"
      ? mutations.updateAssignment
      : mutations.createAssignment;

  const openEditor = (next: Editor) => {
    mutations.createAssignment.reset();
    mutations.updateAssignment.reset();
    setEditor(next);
  };

  const create = async (input: CreateTrainingAssignment) => {
    try {
      await mutations.createAssignment.mutateAsync(input);
      setEditor(undefined);
      toast.success("Черновик занятия создан");
    } catch {
      // Ошибка показана в диалоге, введённые параметры не теряются.
    }
  };

  const update = async (input: TrainingAssignmentSettings) => {
    if (editor?.mode !== "edit") return;
    try {
      await mutations.updateAssignment.mutateAsync({
        assignmentId: editor.assignment.id,
        ...input,
      });
      setEditor(undefined);
      toast.success("Занятие сохранено");
    } catch {
      // Ошибка показана в диалоге.
    }
  };

  const run = async (
    action: LifecycleAction,
    assignment: TrainingAssignment,
  ) => {
    const mutation = {
      launch: mutations.launchAssignment,
      complete: mutations.completeAssignment,
      archive: mutations.archiveAssignment,
    }[action];
    try {
      await mutation.mutateAsync(assignment.id);
      toast.success(
        {
          launch: "Занятие запущено — ученики видят его в своих назначениях",
          complete: "Занятие завершено",
          archive: "Занятие в архиве",
        }[action],
        { description: assignment.title },
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Действие не выполнено",
      );
    }
  };

  const remove = async () => {
    if (!assignmentToDelete) return;
    try {
      await mutations.deleteAssignment.mutateAsync(assignmentToDelete.id);
      setAssignmentToDelete(undefined);
      toast.success("Черновик удалён");
    } catch {
      // Ошибка показана в диалоге.
    }
  };

  const busy =
    mutations.launchAssignment.isPending ||
    mutations.completeAssignment.isPending ||
    mutations.archiveAssignment.isPending;

  const columnDefs: ColDef<TrainingAssignment>[] = [
    { field: "title", headerName: "Занятие", flex: 2, minWidth: 200 },
    {
      colId: "scenario",
      headerName: "Сценарий",
      flex: 2,
      minWidth: 200,
      valueGetter: ({ data }) =>
        data ? `${data.scenarioCode} · ${data.scenarioTitle}` : null,
    },
    {
      field: "status",
      headerName: "Статус",
      minWidth: 150,
      cellRenderer: ({ data }: ICellRendererParams<TrainingAssignment>) =>
        data && (
          <Badge color={ASSIGNMENT_STATUS_COLORS[data.status]}>
            {ASSIGNMENT_STATUS_LABELS[data.status]}
          </Badge>
        ),
    },
    {
      field: "serviceTag",
      headerName: "Служба",
      hide: target.kind === "student",
      minWidth: 130,
      valueFormatter: ({ value }) => value ?? "Все",
    },
    {
      colId: "attempts",
      headerName: "Попытки",
      minWidth: 120,
      valueGetter: ({ data }) =>
        data ? `${data.usedAttempts} / ${data.maxAttempts ?? "∞"}` : null,
      headerTooltip: "Проведено попыток / лимит на ученика",
    },
    {
      field: "passThreshold",
      headerName: "Порог",
      minWidth: 100,
      valueFormatter: ({ value }) => `${value}%`,
    },
    {
      field: "answerNormSeconds",
      headerName: "Норматив",
      minWidth: 110,
      valueFormatter: ({ value }) => formatDuration(value),
    },
    {
      field: "cardSource",
      headerName: "Карточки",
      minWidth: 190,
      valueFormatter: ({ value }) =>
        CARD_SOURCE_LABELS[value as TrainingAssignment["cardSource"]],
    },
    {
      field: "dueDate",
      headerName: "Срок",
      minWidth: 160,
      valueFormatter: ({ value }) => (value ? formatDateTime(value) : "—"),
    },
    {
      ...ACTION_COLUMN,
      width: 300,
      cellRenderer: ({ data }: ICellRendererParams<TrainingAssignment>) => {
        if (!data) return null;
        const actions = assignmentActions(data.status);
        return (
          <Flex align="center" justify="center" gap="2" className="h-full">
            {actions.includes("launch") && (
              <Button
                size="1"
                color="green"
                disabled={busy}
                onClick={() => void run("launch", data)}
              >
                <Play size={14} /> Запустить
              </Button>
            )}
            {actions.includes("complete") && (
              <Button
                size="1"
                color="red"
                variant="soft"
                disabled={busy}
                onClick={() => void run("complete", data)}
              >
                <CircleStop size={14} /> Завершить
              </Button>
            )}
            {actions.includes("edit") && (
              <IconButton
                size="1"
                variant="soft"
                aria-label="Изменить занятие"
                title="Изменить"
                onClick={() => openEditor({ mode: "edit", assignment: data })}
              >
                <Pencil size={14} />
              </IconButton>
            )}
            {actions.includes("archive") && (
              <IconButton
                size="1"
                variant="soft"
                color="gray"
                aria-label="Отправить в архив"
                title="В архив"
                disabled={busy}
                onClick={() => void run("archive", data)}
              >
                <Archive size={14} />
              </IconButton>
            )}
            {actions.includes("delete") && (
              <IconButton
                size="1"
                variant="soft"
                color="red"
                aria-label="Удалить черновик"
                title="Удалить"
                onClick={() => {
                  mutations.deleteAssignment.reset();
                  setAssignmentToDelete(data);
                }}
              >
                <Trash2 size={14} />
              </IconButton>
            )}
          </Flex>
        );
      },
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Flex align="center" justify="between" gap="3">
        <Text size="2" color="gray">
          {target.kind === "group"
            ? "Черновик не виден ученикам, пока вы не запустите занятие."
            : "Индивидуальные занятия ученика вне групп. Черновик он не видит, пока вы не запустите занятие."}{" "}
          Идущее занятие не редактируется: все попытки оцениваются по одним
          правилам.
        </Text>
        <Button
          className="shrink-0"
          disabled={target.kind === "group" && target.group.status !== "active"}
          onClick={() => openEditor({ mode: "create" })}
        >
          <Plus size={16} /> Новое занятие
        </Button>
      </Flex>

      <div className="min-h-80 flex-1">
        {assignments.isPending ? (
          <Skeleton height="100%" className="rounded-xl" />
        ) : (
          <DataTableReact<TrainingAssignment>
            {...DATA_TABLE_DEFAULTS}
            rowData={rows}
            columnDefs={columnDefs}
            getRowId={({ data }) => data.id}
          />
        )}
      </div>

      <AssignmentFormDialog
        open={editor !== undefined}
        onOpenChange={(open) => !open && setEditor(undefined)}
        target={target}
        assignment={editor?.mode === "edit" ? editor.assignment : undefined}
        scenarios={scenarios.data ?? []}
        pending={saving.isPending}
        error={saving.error?.message}
        onCreate={(input) => void create(input)}
        onUpdate={(input) => void update(input)}
      />

      <TrainingConfirmDialog
        open={assignmentToDelete !== undefined}
        onOpenChange={(open) => !open && setAssignmentToDelete(undefined)}
        title="Удалить черновик?"
        description={
          <>
            Черновик <strong>{assignmentToDelete?.title}</strong> ещё не
            запускался, попыток по нему нет.
          </>
        }
        confirmLabel="Удалить"
        pending={mutations.deleteAssignment.isPending}
        error={mutations.deleteAssignment.error?.message}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
