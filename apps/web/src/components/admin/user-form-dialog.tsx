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

import { ROLE_LABELS } from "../../config/roles";
import type { AuthUser, UserRole } from "../../contracts/auth";
import { passwordProblem, type UpdateUser } from "../../contracts/users";
import type { UserMutations } from "../../hooks/use-users";
import { TrainingField } from "../training/training-field";

interface UserFormDialogProps {
  currentUserId: string;
  mutations: UserMutations;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  user?: AuthUser;
}

/** Создание и редактирование учётной записи без внутренних полей системы. */
export function UserFormDialog({
  currentUserId,
  mutations,
  onOpenChange,
  open,
  user,
}: UserFormDialogProps) {
  const pending = mutations.create.isPending || mutations.update.isPending;

  return (
    <Dialog.Root open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <Dialog.Content maxWidth="680px" className="w-[calc(100vw-2rem)] sm:max-w-[680px]">
        {open && (
          <UserForm
            key={user?.id ?? "new"}
            currentUserId={currentUserId}
            mutations={mutations}
            user={user}
            onDone={() => onOpenChange(false)}
          />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function UserForm({
  currentUserId,
  mutations,
  onDone,
  user,
}: Pick<UserFormDialogProps, "currentUserId" | "mutations" | "user"> & {
  onDone: () => void;
}) {
  const editing = user !== undefined;
  const self = user?.id === currentUserId;
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<UserRole>(user?.role ?? "operator");
  const [password, setPassword] = useState("");
  const activeMutation = editing ? mutations.update : mutations.create;
  const passwordHint = password === "" ? null : passwordProblem(password);
  const passwordRequired = !editing;
  const canSubmit =
    !activeMutation.isPending &&
    fullName.trim().length >= 2 &&
    email.trim() !== "" &&
    (!passwordRequired || password !== "") &&
    passwordHint === null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    try {
      if (user) {
        const input: UpdateUser = {
          ...(fullName.trim() !== user.fullName && {
            fullName: fullName.trim(),
          }),
          ...(email.trim() !== user.email && { email: email.trim() }),
          ...(!self && role !== user.role && { role }),
          ...(password !== "" && { password }),
        };
        if (Object.keys(input).length > 0) {
          await mutations.update.mutateAsync({ userId: user.id, input });
        }
        toast.success("Учётная запись сохранена", {
          description:
            password === ""
              ? fullName.trim()
              : `${fullName.trim()}. Все прежние входы завершены.`,
        });
      } else {
        await mutations.create.mutateAsync({
          fullName: fullName.trim(),
          email: email.trim(),
          password,
          role,
        });
        toast.success("Пользователь создан", {
          description: `${fullName.trim()}. Передайте ему email и временный пароль.`,
        });
      }
      onDone();
    } catch {
      // Понятная доменная ошибка остаётся в диалоге.
    }
  };

  return (
    <form onSubmit={submit}>
      <Dialog.Title>
        {editing ? "Редактировать пользователя" : "Новый пользователь"}
      </Dialog.Title>
      <Dialog.Description size="2" mb="4" color="gray">
        {editing
          ? "Изменение роли или пароля завершит активные входы пользователя."
          : "Публичной регистрации нет: доступ выдаёт администратор."}
      </Dialog.Description>

      <div className="grid gap-4 sm:grid-cols-2">
        <TrainingField label="ФИО" className="sm:col-span-2">
          <TextField.Root
            required
            autoFocus
            minLength={2}
            placeholder="Смирнова Анна Сергеевна"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </TrainingField>
        <TrainingField label="Email для входа">
          <TextField.Root
            required
            type="email"
            autoComplete="off"
            placeholder="a.smirnova@example.org"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </TrainingField>
        <TrainingField
          label="Роль"
          hint={self ? "Свою роль изменить нельзя" : undefined}
        >
          <Select.Root
            value={role}
            onValueChange={(value) => setRole(value as UserRole)}
            disabled={self}
          >
            <Select.Trigger className="w-full" />
            <Select.Content>
              {(Object.keys(ROLE_LABELS) as UserRole[]).map((value) => (
                <Select.Item key={value} value={value}>
                  {ROLE_LABELS[value]}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </TrainingField>
        <TrainingField
          label={editing ? "Новый пароль" : "Временный пароль"}
          hint={
            passwordHint ??
            (editing ? "Оставьте пустым, чтобы не менять" : undefined)
          }
          reserveHintSpace
          className="sm:col-span-2"
        >
          <TextField.Root
            required={passwordRequired}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </TrainingField>
      </div>

      {activeMutation.error && (
        <Callout.Root color="red" size="1" mt="3" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>{activeMutation.error.message}</Callout.Text>
        </Callout.Root>
      )}

      <Flex justify="end" gap="2" mt="4">
        <Dialog.Close>
          <Button
            type="button"
            variant="soft"
            color="gray"
            disabled={activeMutation.isPending}
          >
            Отмена
          </Button>
        </Dialog.Close>
        <Button type="submit" disabled={!canSubmit}>
          {editing ? "Сохранить" : "Создать"}
        </Button>
      </Flex>
    </form>
  );
}
