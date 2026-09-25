import {
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Select,
  Text,
  toast,
} from "@bolid-ui/themes";
import { AlertTriangle, Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { ROUTES } from "../../config/routes";
import type {
  AssignmentTarget,
  CreateTrainingAssignment,
} from "../../contracts/training";
import { useScenarios } from "../../hooks/use-scenarios";
import {
  useStudents,
  useTrainingGroups,
  useTrainingMutations,
} from "../../hooks/use-training";
import { AssignmentFormDialog } from "../training/assignment-form-dialog";

/** Создание и немедленный запуск назначения без переходов по группам. */
export function DdsAssignmentCreator() {
  const navigate = useNavigate();
  const groups = useTrainingGroups();
  const students = useStudents();
  const scenarios = useScenarios();
  const mutations = useTrainingMutations();
  const [targetKey, setTargetKey] = useState("");
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const createdAssignmentId = useRef<string | undefined>(undefined);

  const target = useMemo<AssignmentTarget | undefined>(() => {
    const [kind, id] = targetKey.split(":");
    if (kind === "group") {
      const group = groups.data?.find((item) => item.id === id);
      return group ? { kind: "group", group } : undefined;
    }
    if (kind === "student") {
      const student = students.data?.find((item) => item.id === id);
      return student
        ? {
            kind: "student",
            student: { id: student.id, fullName: student.fullName },
          }
        : undefined;
    }
    return undefined;
  }, [groups.data, students.data, targetKey]);

  const createAndLaunch = async (input: CreateTrainingAssignment) => {
    setSubmitError(undefined);
    try {
      const assignmentId =
        createdAssignmentId.current ??
        (await mutations.createAssignment.mutateAsync(input)).id;
      createdAssignmentId.current = assignmentId;
      await mutations.launchAssignment.mutateAsync(assignmentId);
      createdAssignmentId.current = undefined;
      setOpen(false);
      toast.success("Карточка ДДС назначена", {
        description:
          target?.kind === "group"
            ? `Все ученики группы «${target.group.name}» увидят её в разделе «Мои назначения».`
            : `${target?.student.fullName ?? "Ученик"} увидит её в разделе «Мои назначения».`,
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Не удалось создать назначение",
      );
    }
  };

  const loading = groups.isPending || students.isPending || scenarios.isPending;
  const loadError = groups.error ?? students.error ?? scenarios.error;
  const noTargets =
    !loading &&
    (groups.data?.filter((group) => group.status === "active").length ?? 0) ===
      0 &&
    (students.data?.length ?? 0) === 0;
  const noScenarios = !loading && (scenarios.data?.length ?? 0) === 0;

  return (
    <Card size="3" className="grid gap-3">
      <div>
        <Heading size="4">Создать и назначить карточку ДДС</Heading>
        <Text as="p" size="2" color="gray" mt="1">
          1. Выберите группу или ученика. 2. Настройте карточку. 3. Нажмите
          «Создать и назначить». Ученик получит её в «Моих назначениях», а
          отдельная карточка появится, когда он начнёт попытку.
        </Text>
      </div>

      {loadError && (
        <Callout.Root color="red" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>{loadError.message}</Callout.Text>
        </Callout.Root>
      )}

      {noTargets && (
        <Callout.Root color="amber">
          <Callout.Text>
            Сначала создайте активную учебную группу или добавьте доступного
            ученика.
          </Callout.Text>
        </Callout.Root>
      )}

      {noScenarios && (
        <Callout.Root color="amber">
          <Callout.Text>
            Для карточки нужен опубликованный сценарий. Создайте и опубликуйте
            его в разделе «Сценарии».
          </Callout.Text>
        </Callout.Root>
      )}

      <Flex align="end" gap="2" wrap="wrap">
        <label className="grid min-w-72 flex-1 gap-1">
          <Text size="2" weight="bold">
            Кому назначить
          </Text>
          <Select.Root value={targetKey} onValueChange={setTargetKey}>
            <Select.Trigger
              className="w-full"
              placeholder={
                loading ? "Загрузка…" : "Выберите группу или ученика"
              }
              aria-label="Получатель карточки ДДС"
            />
            <Select.Content>
              {(groups.data ?? [])
                .filter((group) => group.status === "active")
                .map((group) => (
                  <Select.Item key={group.id} value={`group:${group.id}`}>
                    Группа · {group.name} ({group.members.length} уч.)
                  </Select.Item>
                ))}
              {(students.data ?? []).map((student) => (
                <Select.Item key={student.id} value={`student:${student.id}`}>
                  Ученик · {student.fullName}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </label>
        <Button
          type="button"
          disabled={!target || loading || noScenarios}
          onClick={() => {
            mutations.createAssignment.reset();
            mutations.launchAssignment.reset();
            createdAssignmentId.current = undefined;
            setSubmitError(undefined);
            setOpen(true);
          }}
        >
          <Plus size={16} /> Настроить карточку ДДС
        </Button>
      </Flex>

      {(noTargets || noScenarios) && (
        <Flex gap="2" wrap="wrap">
          {noTargets && (
            <Button
              type="button"
              variant="soft"
              onClick={() => navigate(ROUTES.groups())}
            >
              Открыть группы
            </Button>
          )}
          {noScenarios && (
            <Button
              type="button"
              variant="soft"
              onClick={() => navigate(ROUTES.scenarios())}
            >
              Открыть сценарии
            </Button>
          )}
        </Flex>
      )}

      {target && (
        <AssignmentFormDialog
          open={open}
          onOpenChange={setOpen}
          target={target}
          scenarios={scenarios.data ?? []}
          pending={
            mutations.createAssignment.isPending ||
            mutations.launchAssignment.isPending
          }
          error={submitError}
          initialMode="card_action"
          lockMode
          createTitle="Назначить карточку ДДС"
          createDescription={
            target.kind === "group"
              ? `Карточка будет сразу назначена всем ученикам группы «${target.group.name}».`
              : `Карточка будет сразу назначена ученику ${target.student.fullName}.`
          }
          createSubmitLabel="Создать и назначить"
          onCreate={(input) => void createAndLaunch(input)}
          onUpdate={() => {}}
        />
      )}
    </Card>
  );
}
