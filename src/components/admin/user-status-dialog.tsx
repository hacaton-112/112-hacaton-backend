import { Button, Callout, Dialog, Flex, Text, toast } from "@bolid-ui/themes";
import { AlertTriangle } from "lucide-react";

import type { AuthUser } from "../../contracts/auth";
import type { UserMutations } from "../../hooks/use-users";

interface UserStatusDialogProps {
  mutations: UserMutations;
  onOpenChange: (open: boolean) => void;
  user?: AuthUser;
}

/** Подтверждение обратимого отключения или повторного включения доступа. */
export function UserStatusDialog({
  mutations,
  onOpenChange,
  user,
}: UserStatusDialogProps) {
  const pending = mutations.update.isPending;
  const activate = user?.isActive === false;

  const confirm = async () => {
    if (!user) return;
    try {
      await mutations.update.mutateAsync({
        userId: user.id,
        input: { isActive: !user.isActive },
      });
      toast.success(activate ? "Доступ восстановлен" : "Доступ отключён", {
        description: user.fullName,
      });
      onOpenChange(false);
    } catch {
      // Ошибка показана ниже и не закрывает подтверждение.
    }
  };

  return (
    <Dialog.Root
      open={user !== undefined}
      onOpenChange={pending ? undefined : onOpenChange}
    >
      <Dialog.Content maxWidth="460px">
        <Dialog.Title>
          {activate ? "Восстановить доступ?" : "Отключить пользователя?"}
        </Dialog.Title>
        <Dialog.Description size="2" mb="3">
          {activate ? (
            <>
              <Text weight="bold">{user?.fullName}</Text> снова сможет входить в
              тренажёр с прежним паролем.
            </>
          ) : (
            <>
              <Text weight="bold">{user?.fullName}</Text> не сможет войти или
              обновить сессию. История занятий и аудита сохранится.
            </>
          )}
        </Dialog.Description>

        {mutations.update.error && (
          <Callout.Root color="red" size="1" mt="3" role="alert">
            <Callout.Icon>
              <AlertTriangle size={16} />
            </Callout.Icon>
            <Callout.Text>{mutations.update.error.message}</Callout.Text>
          </Callout.Root>
        )}

        <Flex justify="end" gap="2" mt="4">
          <Dialog.Close>
            <Button
              type="button"
              variant="soft"
              color="gray"
              disabled={pending}
            >
              Отмена
            </Button>
          </Dialog.Close>
          <Button
            type="button"
            color={activate ? undefined : "red"}
            disabled={pending}
            onClick={confirm}
          >
            {activate ? "Восстановить" : "Отключить"}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
