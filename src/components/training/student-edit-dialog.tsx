import {
  Button,
  Callout,
  Dialog,
  Flex,
  Text,
  TextField,
  toast,
} from "@bolid-ui/themes";
import { AlertTriangle } from "lucide-react";
import { useState, type FormEvent } from "react";

import { canCreateUsers } from "../../config/roles";
import type { TrainingGroup } from "../../contracts/training";
import { passwordProblem, type UpdateUser } from "../../contracts/users";
import type { TrainingMutations } from "../../hooks/use-training";
import { useAuthStore } from "../../stores/auth.store";
import { TrainingField } from "./training-field";

type EditedStudent = Pick<
  TrainingGroup["members"][number],
  "userId" | "fullName" | "email"
> & {
  /** Служба в группе; `undefined` — ученик правится вне группы. */
  serviceTag?: string;
};

interface StudentEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Без группы меняется только учётная запись. */
  groupId?: string;
  student?: EditedStudent;
  mutations: TrainingMutations;
}

/**
 * Ученик целиком: ФИО, email и пароль учётной записи меняет администратор
 * (ТЗ, стр. 9), службу в группе — преподаватель.
 */
export function StudentEditDialog({
  open,
  onOpenChange,
  groupId,
  student,
  mutations,
}: StudentEditDialogProps) {
  const pending = mutations.updateStudent.isPending;

  return (
    <Dialog.Root open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <Dialog.Content maxWidth="520px">
        {open && student && (
          <StudentEditForm
            groupId={groupId}
            student={student}
            mutations={mutations}
            onDone={() => onOpenChange(false)}
          />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function StudentEditForm({
  groupId,
  student,
  mutations,
  onDone,
}: {
  groupId?: string;
  student: EditedStudent;
  mutations: TrainingMutations;
  onDone: () => void;
}) {
  const isAdmin = canCreateUsers(useAuthStore((state) => state.user?.role));
  const [fullName, setFullName] = useState(student.fullName);
  const [email, setEmail] = useState(student.email);
  const [password, setPassword] = useState("");
  const [serviceTag, setServiceTag] = useState(student.serviceTag ?? "");
  const inGroup = groupId !== undefined && student.serviceTag !== undefined;
  const { updateStudent } = mutations;
  const passwordHint = password === "" ? null : passwordProblem(password);
  const canSubmit =
    !updateStudent.isPending &&
    (!inGroup || serviceTag.trim() !== "") &&
    fullName.trim().length >= 2 &&
    passwordHint === null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    const account: UpdateUser = isAdmin
      ? {
          ...(fullName.trim() !== student.fullName && {
            fullName: fullName.trim(),
          }),
          ...(email.trim() !== student.email && { email: email.trim() }),
          ...(password !== "" && { password }),
        }
      : {};
    try {
      await updateStudent.mutateAsync({
        userId: student.userId,
        account: Object.keys(account).length > 0 ? account : null,
        membership:
          inGroup && groupId && serviceTag.trim() !== student.serviceTag
            ? { groupId, serviceTag: serviceTag.trim() }
            : null,
      });
      toast.success("Ученик сохранён", {
        description:
          password === ""
            ? fullName.trim()
            : `${fullName.trim()}. Пароль сменён, ученику нужно войти заново.`,
      });
      onDone();
    } catch {
      // Причина остаётся в диалоге.
    }
  };

  return (
    <form onSubmit={submit}>
      <Dialog.Title>Изменить ученика</Dialog.Title>
      <Dialog.Description size="2" mb="4" color="gray">
        {isAdmin
          ? "Новый пароль завершит все входы ученика."
          : "ФИО, email и пароль меняет администратор. Служба определяет, какие занятия группы увидит ученик."}
      </Dialog.Description>

      <div className="grid gap-3 sm:grid-cols-2">
        <TrainingField label="ФИО" className="sm:col-span-2">
          <TextField.Root
            required
            autoFocus={isAdmin}
            disabled={!isAdmin}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </TrainingField>
        <TrainingField label="Email для входа" className="sm:col-span-2">
          <TextField.Root
            required
            type="email"
            disabled={!isAdmin}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </TrainingField>
        {isAdmin ? (
          <TrainingField
            label="Новый пароль"
            hint={passwordHint ?? undefined}
            reserveHintSpace
            className="sm:col-span-2"
          >
            <TextField.Root
              type="password"
              autoComplete="new-password"
              placeholder="Оставьте пустым, чтобы не менять"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </TrainingField>
        ) : (
          <TrainingField label="Пароль" className="sm:col-span-2">
            <Text size="2" color="gray">
              Меняет администратор
            </Text>
          </TrainingField>
        )}
        {inGroup && (
          <TrainingField label="Служба ученика" className="sm:col-span-2">
            <TextField.Root
              required
              autoFocus={!isAdmin}
              placeholder="FIRE_101"
              value={serviceTag}
              onChange={(event) => setServiceTag(event.target.value)}
            />
          </TrainingField>
        )}
      </div>

      {updateStudent.error && (
        <Callout.Root color="red" size="1" mt="3" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>{updateStudent.error.message}</Callout.Text>
        </Callout.Root>
      )}

      <Flex justify="end" gap="2" mt="4">
        <Dialog.Close>
          <Button
            type="button"
            variant="soft"
            color="gray"
            disabled={updateStudent.isPending}
          >
            Отмена
          </Button>
        </Dialog.Close>
        <Button type="submit" disabled={!canSubmit}>
          Сохранить
        </Button>
      </Flex>
    </form>
  );
}
