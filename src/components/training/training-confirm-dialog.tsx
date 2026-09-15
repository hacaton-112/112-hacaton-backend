import { Button, Callout, Dialog, Flex } from "@bolid-ui/themes";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

interface TrainingConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pending: boolean;
  /** Подтверждение ещё невозможно, например не указана причина. */
  confirmDisabled?: boolean;
  error?: string;
  onConfirm: () => void;
  children?: ReactNode;
}

/** Подтверждение необратимого действия в учебном центре. */
export function TrainingConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  confirmDisabled = false,
  error,
  onConfirm,
  children,
}: TrainingConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <Dialog.Content maxWidth="460px">
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Description size="2" mb="3">
          {description}
        </Dialog.Description>

        {children}

        {error && (
          <Callout.Root color="red" size="1" mt="3" role="alert">
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
          <Button
            color="red"
            disabled={pending || confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
