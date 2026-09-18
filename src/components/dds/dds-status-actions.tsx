import {
  Button,
  Callout,
  Flex,
  Select,
  Spinner,
  Text,
  TextField,
} from "@bolid-ui/themes";
import { AlertTriangle, Check } from "lucide-react";
import { useState } from "react";

import type {
  DdsExercise,
  DdsResponseStatus,
} from "../../contracts/dds-exercise";
import { DDS_STATUS_LABELS, requiresComment } from "./dds-formatters";

type TransitionStatus = Exclude<DdsResponseStatus, "pending">;

export function DdsStatusActions({
  exercise,
  pending,
  error,
  onTransition,
}: {
  exercise: DdsExercise;
  pending: boolean;
  error?: string;
  onTransition: (status: TransitionStatus, comment?: string) => Promise<void>;
}) {
  const available = exercise.allowedTransitions.filter(
    (status): status is TransitionStatus => status !== "pending",
  );
  const [selected, setSelected] = useState<TransitionStatus | undefined>(
    available[0],
  );
  const [comment, setComment] = useState("");

  if (available.length === 0 || !selected) return null;

  const commentMissing = requiresComment(selected) && !comment.trim();

  const run = async () => {
    await onTransition(selected, comment);
    setComment("");
  };

  return (
    <div className="arm-dds-status-editor">
      <div className="arm-dds-status-fields">
        <label>
          <Text as="span" size="1">
            Статус
          </Text>
          <Select.Root
            value={selected}
            onValueChange={(value) => setSelected(value as TransitionStatus)}
            disabled={pending}
          >
            <Select.Trigger aria-label="Следующий статус" />
            <Select.Content>
              {available.map((status) => (
                <Select.Item key={status} value={status}>
                  {DDS_STATUS_LABELS[status]}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </label>

        <label>
          <Text as="span" size="1">
            Номер наряда
          </Text>
          <TextField.Root placeholder="—" disabled />
        </label>

        <label className="arm-dds-comment-field">
          <Text as="span" size="1">
            Комментарий{requiresComment(selected) ? " *" : ""}
          </Text>
          <TextField.Root
            value={comment}
            onChange={(event) => setComment(event.currentTarget.value)}
            maxLength={1_000}
            placeholder="Введите результат реагирования"
            disabled={pending}
          />
        </label>

        <Button
          type="button"
          className="arm-dds-status-submit"
          disabled={pending || commentMissing}
          onClick={() => void run().catch(() => undefined)}
          aria-label="Сохранить статус"
        >
          {pending ? <Spinner size="1" /> : <Check size={18} />}
          Сохранить
        </Button>
      </div>

      {commentMissing && (
        <Text size="1" color="red">
          Для выбранного статуса обязателен комментарий.
        </Text>
      )}

      {error && (
        <Callout.Root color="red" size="1" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      {pending && (
        <Flex align="center" gap="2">
          <Spinner size="1" />
          <Text size="1">Сохраняем статус…</Text>
        </Flex>
      )}
    </div>
  );
}
