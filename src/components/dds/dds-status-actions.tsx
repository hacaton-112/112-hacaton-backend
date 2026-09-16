import {
  Button,
  Callout,
  Flex,
  Spinner,
  Text,
  TextArea,
} from "@bolid-ui/themes";
import { AlertTriangle, Check, X } from "lucide-react";
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
  const [comment, setComment] = useState("");
  const available = exercise.allowedTransitions.filter(
    (status): status is TransitionStatus => status !== "pending",
  );

  const run = async (status: TransitionStatus) => {
    await onTransition(status, comment);
    setComment("");
  };

  if (available.length === 0) return null;

  return (
    <div className="grid gap-3">
      <Text size="2" weight="bold">
        Следующее действие
      </Text>
      <div className="grid gap-2">
        <TextArea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={3}
          maxLength={1_000}
          placeholder="Комментарий к действию (для отказа обязателен)"
          disabled={pending}
        />
        <Text size="1" color="gray">
          Комментарий сохранится в хронологии. Для «Не принята» и отказа он
          обязателен.
        </Text>
      </div>
      <Flex gap="2" wrap="wrap">
        {available.map((status) => (
          <Button
            key={status}
            type="button"
            color={
              status === "not_accepted" || status === "refused"
                ? "red"
                : status === "completed"
                  ? "green"
                  : "blue"
            }
            variant={status === "accepted" ? "solid" : "soft"}
            disabled={pending || (requiresComment(status) && !comment.trim())}
            onClick={() => {
              void run(status).catch(() => undefined);
            }}
          >
            {status === "not_accepted" || status === "refused" ? (
              <X size={16} />
            ) : (
              <Check size={16} />
            )}
            {DDS_STATUS_LABELS[status]}
          </Button>
        ))}
      </Flex>

      {pending && (
        <Flex align="center" gap="2">
          <Spinner size="1" />
          <Text size="1" color="gray">
            Сохраняем статус…
          </Text>
        </Flex>
      )}

      {error && (
        <Callout.Root color="red" size="1" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}
    </div>
  );
}
