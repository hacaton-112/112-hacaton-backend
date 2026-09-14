import { Button, Callout, Dialog, Flex, Spinner, Text } from "@bolid-ui/themes";
import { AlertTriangle, Trash2 } from "lucide-react";

interface ScenarioDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  title: string;
  pending: boolean;
  error?: string;
  onConfirm: () => void;
}

/**
 * Подтверждение удаления сценария.
 *
 * Текст говорит, что пропадёт и что останется: преподаватель должен знать,
 * что разборы уже проведённых занятий никуда не деваются.
 */
export function ScenarioDeleteDialog({
  open,
  onOpenChange,
  code,
  title,
  pending,
  error,
  onConfirm,
}: ScenarioDeleteDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <Dialog.Content maxWidth="460px">
        <Dialog.Title>Удалить сценарий?</Dialog.Title>
        <Dialog.Description size="2" mb="3">
          <strong>
            {code} · {title}
          </strong>{" "}
          пропадёт из каталога, и начать по нему новую тренировку будет нельзя.
          Проведённые звонки и их разборы сохранятся.
        </Dialog.Description>

        {error && (
          <Callout.Root color="red" size="1" mb="3" role="alert">
            <Callout.Icon>
              <AlertTriangle size={16} />
            </Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        <Flex justify="end" gap="2" mt="4">
          <Dialog.Close>
            <Button variant="soft" color="gray" disabled={pending}>
              Отмена
            </Button>
          </Dialog.Close>
          <Button color="red" disabled={pending} onClick={onConfirm}>
            {pending ? <Spinner size="1" /> : <Trash2 size={16} />}
            <Text>{pending ? "Удаляем…" : "Удалить"}</Text>
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
