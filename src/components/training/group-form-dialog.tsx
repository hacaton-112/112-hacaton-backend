import {
  Button,
  Callout,
  Dialog,
  Flex,
  Select,
  TextField,
  toast,
} from "@bolid-ui/themes";
import { AlertTriangle } from "lucide-react";
import { useState, type FormEvent } from "react";

import { canCreateUsers } from "../../config/roles";
import type {
  TrainingGroup,
  TrainingGroupStatus,
  UpdateTrainingGroup,
} from "../../contracts/training";
import { useUsers, type TrainingMutations } from "../../hooks/use-training";
import { useAuthStore } from "../../stores/auth.store";
import { TrainingField } from "./training-field";

const STATUS_LABELS: Record<TrainingGroupStatus, string> = {
  active: "Активна",
  archived: "В архиве",
};

interface GroupFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Группа на правку; без неё диалог создаёт новую. */
  group?: TrainingGroup;
  mutations: TrainingMutations;
}

export function GroupFormDialog({
  open,
  onOpenChange,
  group,
  mutations,
}: GroupFormDialogProps) {
  const pending =
    mutations.createGroup.isPending || mutations.updateGroup.isPending;

  return (
    <Dialog.Root open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <Dialog.Content maxWidth="520px">
        {open && (
          <GroupForm
            group={group}
            mutations={mutations}
            onDone={() => onOpenChange(false)}
          />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function GroupForm({
  group,
  mutations,
  onDone,
}: Pick<GroupFormDialogProps, "group" | "mutations"> & {
  onDone: () => void;
}) {
  const isEdit = group !== undefined;
  // Передать группу другому преподавателю может только администратор.
  const isAdmin = canCreateUsers(useAuthStore((state) => state.user?.role));
  const instructors = useUsers("instructor", isEdit && isAdmin);
  const [name, setName] = useState(group?.name ?? "");
  const [code, setCode] = useState(group?.code ?? "");
  const [organization, setOrganization] = useState(group?.organization ?? "");
  const [status, setStatus] = useState<TrainingGroupStatus>(
    group?.status ?? "active",
  );
  const [instructorId, setInstructorId] = useState(group?.instructorId ?? "");
  const saving = isEdit ? mutations.updateGroup : mutations.createGroup;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (group) {
        const changes: UpdateTrainingGroup = {
          ...(name !== group.name && { name }),
          ...(code.toUpperCase() !== group.code && { code }),
          ...(organization !== group.organization && { organization }),
          ...(status !== group.status && { status }),
          ...(isAdmin &&
            instructorId !== group.instructorId && { instructorId }),
        };
        if (Object.keys(changes).length > 0) {
          await mutations.updateGroup.mutateAsync({
            groupId: group.id,
            ...changes,
          });
        }
        toast.success("Группа сохранена", { description: name });
      } else {
        await mutations.createGroup.mutateAsync({ name, code, organization });
        toast.success("Группа создана", { description: name });
      }
      onDone();
    } catch {
      // Причина остаётся в диалоге.
    }
  };

  return (
    <form onSubmit={submit}>
      <Dialog.Title>{isEdit ? "Изменить группу" : "Новая группа"}</Dialog.Title>
      <Dialog.Description size="2" mb="4" color="gray">
        Группа объединяет учеников одного потока. Занятия назначаются группе
        целиком.
      </Dialog.Description>

      <div className="grid gap-3 sm:grid-cols-2">
        <TrainingField label="Название" className="sm:col-span-2">
          <TextField.Root
            required
            autoFocus
            placeholder="ДДС Гормост — поток 1"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </TrainingField>
        <TrainingField label="Код группы">
          <TextField.Root
            required
            placeholder="GRP-GORMOST-01"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </TrainingField>
        <TrainingField label="Организация">
          <TextField.Root
            required
            placeholder="ГБУ «Гормост»"
            value={organization}
            onChange={(event) => setOrganization(event.target.value)}
          />
        </TrainingField>
        {isEdit && (
          <TrainingField label="Статус">
            <Select.Root
              value={status}
              onValueChange={(value) => setStatus(value as TrainingGroupStatus)}
            >
              <Select.Trigger />
              <Select.Content>
                {(Object.keys(STATUS_LABELS) as TrainingGroupStatus[]).map(
                  (key) => (
                    <Select.Item key={key} value={key}>
                      {STATUS_LABELS[key]}
                    </Select.Item>
                  ),
                )}
              </Select.Content>
            </Select.Root>
          </TrainingField>
        )}
        {isEdit && isAdmin && (
          <TrainingField label="Преподаватель">
            <Select.Root value={instructorId} onValueChange={setInstructorId}>
              <Select.Trigger placeholder="Выберите преподавателя" />
              <Select.Content>
                {(instructors.data ?? []).map((instructor) => (
                  <Select.Item key={instructor.id} value={instructor.id}>
                    {instructor.fullName}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </TrainingField>
        )}
      </div>

      {saving.error && (
        <Callout.Root color="red" size="1" mt="3" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>{saving.error.message}</Callout.Text>
        </Callout.Root>
      )}

      <Flex justify="end" gap="2" mt="4">
        <Dialog.Close>
          <Button
            type="button"
            variant="soft"
            color="gray"
            disabled={saving.isPending}
          >
            Отмена
          </Button>
        </Dialog.Close>
        <Button type="submit" disabled={saving.isPending}>
          {isEdit ? "Сохранить" : "Создать"}
        </Button>
      </Flex>
    </form>
  );
}
