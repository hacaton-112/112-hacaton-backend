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
import { passwordProblem } from "../../contracts/users";
import type { TrainingMutations } from "../../hooks/use-training";
import { TrainingField } from "./training-field";

/** Без группы — пустое значение Select, который не принимает `""`. */
const NO_GROUP = "none";

interface StudentCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: TrainingGroup[];
  /** Со страницы группы ученик сразу попадает в неё. */
  groupId?: string;
  mutations: TrainingMutations;
}

/** Учётную запись ученика создаёт администратор (ТЗ, стр. 9). */
export function StudentCreateDialog({
  open,
  onOpenChange,
  mutations,
  ...rest
}: StudentCreateDialogProps) {
  const pending = mutations.createStudent.isPending;

  return (
    <Dialog.Root open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <Dialog.Content maxWidth="520px">
        {open && (
          <StudentCreateForm
            {...rest}
            mutations={mutations}
            onDone={() => onOpenChange(false)}
          />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function StudentCreateForm({
  groups,
  groupId: fixedGroupId,
  mutations,
  onDone,
}: Omit<StudentCreateDialogProps, "open" | "onOpenChange"> & {
  onDone: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [groupId, setGroupId] = useState(fixedGroupId ?? NO_GROUP);
  const [serviceTag, setServiceTag] = useState("");
  const { createStudent } = mutations;
  const activeGroups = groups.filter(({ status }) => status === "active");
  const withGroup = groupId !== NO_GROUP;
  const passwordHint = password === "" ? null : passwordProblem(password);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (passwordProblem(password) || (withGroup && !serviceTag.trim())) return;
    try {
      await createStudent.mutateAsync({
        fullName,
        email,
        password,
        membership: withGroup
          ? { groupId, serviceTag: serviceTag.trim() }
          : null,
      });
      toast.success("Ученик создан", {
        description: `${fullName}. Передайте ему email и пароль для входа.`,
      });
      onDone();
    } catch {
      // Причина остаётся в диалоге. Если учётная запись создалась, а в группу
      // не попала, повторное создание скажет, что email занят.
    }
  };

  return (
    <form onSubmit={submit}>
      <Dialog.Title>Новый ученик</Dialog.Title>
      <Dialog.Description size="2" mb="4" color="gray">
        Учётная запись с ролью оператора. Пароль ученик получает от вас.
      </Dialog.Description>

      <div className="grid gap-3 sm:grid-cols-2">
        <TrainingField label="ФИО" className="sm:col-span-2">
          <TextField.Root
            required
            autoFocus
            placeholder="Смирнова Анна Сергеевна"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </TrainingField>
        <TrainingField label="Email для входа" className="sm:col-span-2">
          <TextField.Root
            required
            type="email"
            placeholder="a.smirnova@gormost.ru"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </TrainingField>
        <TrainingField
          label="Пароль"
          hint={passwordHint ?? undefined}
          reserveHintSpace
          className="sm:col-span-2"
        >
          <TextField.Root
            required
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </TrainingField>
        <TrainingField label="Группа">
          <Select.Root
            value={groupId}
            onValueChange={setGroupId}
            disabled={fixedGroupId !== undefined}
          >
            <Select.Trigger />
            <Select.Content>
              <Select.Item value={NO_GROUP}>Без группы</Select.Item>
              {activeGroups.map((group) => (
                <Select.Item key={group.id} value={group.id}>
                  {group.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </TrainingField>
        {withGroup && (
          <TrainingField label="Служба ученика">
            <TextField.Root
              required
              placeholder="FIRE_101"
              value={serviceTag}
              onChange={(event) => setServiceTag(event.target.value)}
            />
          </TrainingField>
        )}
      </div>

      {createStudent.error && (
        <Callout.Root color="red" size="1" mt="3" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>{createStudent.error.message}</Callout.Text>
        </Callout.Root>
      )}

      <Flex justify="end" gap="2" mt="4">
        <Dialog.Close>
          <Button
            type="button"
            variant="soft"
            color="gray"
            disabled={createStudent.isPending}
          >
            Отмена
          </Button>
        </Dialog.Close>
        <Button
          type="submit"
          disabled={
            createStudent.isPending ||
            passwordHint !== null ||
            (withGroup && !serviceTag.trim())
          }
        >
          Создать
        </Button>
      </Flex>
    </form>
  );
}
