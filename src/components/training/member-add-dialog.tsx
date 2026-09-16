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

import type { TrainingGroup } from "../../contracts/training";
import {
  useTrainingOperators,
  type TrainingMutations,
} from "../../hooks/use-training";
import { TrainingField } from "./training-field";

interface MemberAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: TrainingGroup;
  mutations: TrainingMutations;
}

/** Преподаватель включает в группу уже созданного ученика и указывает его службу. */
export function MemberAddDialog({
  open,
  onOpenChange,
  group,
  mutations,
}: MemberAddDialogProps) {
  const pending = mutations.addMember.isPending;

  return (
    <Dialog.Root open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <Dialog.Content maxWidth="460px">
        {open && (
          <MemberAddForm
            group={group}
            mutations={mutations}
            onDone={() => onOpenChange(false)}
          />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function MemberAddForm({
  group,
  mutations,
  onDone,
}: {
  group: TrainingGroup;
  mutations: TrainingMutations;
  onDone: () => void;
}) {
  const operators = useTrainingOperators();
  const [userId, setUserId] = useState("");
  const [serviceTag, setServiceTag] = useState("");
  const { addMember } = mutations;
  const candidates = (operators.data ?? []).filter(
    (operator) =>
      !group.members.some((member) => member.userId === operator.id),
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId || !serviceTag.trim()) return;
    try {
      await addMember.mutateAsync({
        groupId: group.id,
        userId,
        serviceTag: serviceTag.trim(),
      });
      toast.success("Ученик добавлен в группу");
      onDone();
    } catch {
      // Причина остаётся в диалоге.
    }
  };

  return (
    <form onSubmit={submit}>
      <Dialog.Title>Добавить ученика</Dialog.Title>
      <Dialog.Description size="2" mb="4" color="gray">
        Служба определяет, какие занятия группы увидит ученик.
      </Dialog.Description>

      <div className="grid gap-3">
        <TrainingField label="Ученик">
          <Select.Root value={userId} onValueChange={setUserId}>
            <Select.Trigger
              placeholder={
                candidates.length === 0
                  ? "Все ученики уже в группе"
                  : "Выберите ученика"
              }
            />
            <Select.Content>
              {candidates.map((operator) => (
                <Select.Item key={operator.id} value={operator.id}>
                  {operator.fullName} · {operator.email}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </TrainingField>
        <TrainingField label="Служба ученика">
          <TextField.Root
            required
            placeholder="FIRE_101"
            value={serviceTag}
            onChange={(event) => setServiceTag(event.target.value)}
          />
        </TrainingField>
      </div>

      {addMember.error && (
        <Callout.Root color="red" size="1" mt="3" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>{addMember.error.message}</Callout.Text>
        </Callout.Root>
      )}

      <Flex justify="end" gap="2" mt="4">
        <Dialog.Close>
          <Button
            type="button"
            variant="soft"
            color="gray"
            disabled={addMember.isPending}
          >
            Отмена
          </Button>
        </Dialog.Close>
        <Button
          type="submit"
          disabled={addMember.isPending || !userId || !serviceTag.trim()}
        >
          Добавить
        </Button>
      </Flex>
    </form>
  );
}
