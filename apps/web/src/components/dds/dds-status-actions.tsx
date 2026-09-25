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

type TransitionStatus = Exclude<
  DdsResponseStatus,
  "pending" | "lesson_finished"
>;

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
    (status): status is TransitionStatus =>
      status !== "pending" && status !== "lesson_finished",
  );
  const [selected, setSelected] = useState<TransitionStatus | undefined>(
    available[0],
  );
  const [comment, setComment] = useState("");

  if (available.length === 0 || !selected) return null;

  const commentMissing = requiresComment(selected) && !comment.trim();
  // Наряд выезжает по звонку диспетчера: пока нужный наряд не принял
  // карточку, отмечать начало реагирования нечего.
  const waitingForCrew =
    selected === "responding" && exercise.crewHandoff?.notified === false;
  const textHint =
    selected === "accepted"
      ? "Например: подтвердите приём и укажите, какая бригада направлена."
      : selected === "completed"
        ? "Кратко зафиксируйте результат работ и существенные сведения."
        : selected === "refused"
          ? "Укажите фактическую и обоснованную причину отказа."
          : null;

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
          {textHint && (
            <Text as="span" size="1" color="gray">
              {textHint}
            </Text>
          )}
        </label>

        <Button
          type="button"
          className="arm-dds-status-submit"
          disabled={pending || commentMissing || waitingForCrew}
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

      {waitingForCrew && (
        <Text size="1" color="amber">
          Сначала передайте карточку наряду по телефону — позвоните по номеру из
          блока «Передача наряду».
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
