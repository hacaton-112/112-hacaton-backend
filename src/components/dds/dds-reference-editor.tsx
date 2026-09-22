import {
  Badge,
  Button,
  Card,
  Flex,
  Heading,
  Text,
  TextField,
} from "@bolid-ui/themes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { DdsCardReference } from "../../contracts/dds-reference";
import { ddsReferenceService } from "../../services/dds-reference.service";

export function DdsReferenceEditor({ versionId }: { versionId: string }) {
  const query = useQuery({
    queryKey: ["dds-reference", versionId],
    queryFn: () => ddsReferenceService.get(versionId),
    retry: false,
    refetchInterval: (state) =>
      state.state.data?.jobStatus === "pending" ||
      state.state.data?.jobStatus === "processing"
        ? 2_000
        : false,
  });
  if (!query.data)
    return (
      <Text size="2" color="gray">
        Подготовка эталона…
      </Text>
    );
  const running =
    query.data.jobStatus === "pending" || query.data.jobStatus === "processing";
  return (
    <>
      {running && (
        <Text size="2" color="gray">
          Помощник пересобирает эталон — пункты обновятся здесь же.
        </Text>
      )}
      {/* Ключ включает ход генерации: без него форма осталась бы на прежних
          пунктах, и готовый эталон не был бы виден. */}
      <DdsReferenceForm
        key={`${query.data.id}:${query.data.version}:${query.data.jobStatus}`}
        versionId={versionId}
        initial={query.data}
        pending={running}
      />
    </>
  );
}

function DdsReferenceForm({
  versionId,
  initial,
  pending,
}: {
  versionId: string;
  initial: DdsCardReference;
  pending: boolean;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const [comment, setComment] = useState("");
  const save = useMutation({
    mutationFn: (approveAll: boolean) =>
      ddsReferenceService.update(versionId, draft!, approveAll),
    onSuccess: (data) => {
      setDraft(data);
      client.setQueryData(["dds-reference", versionId], data);
    },
  });
  const regenerate = useMutation({
    mutationFn: () => ddsReferenceService.regenerate(versionId, comment),
    onSuccess: (data) => {
      setDraft(data);
      setComment("");
      client.setQueryData(["dds-reference", versionId], data);
    },
  });
  return (
    <Card size="2" className="grid gap-3">
      <Flex justify="between" gap="3">
        <Heading size="3">Эталон текста</Heading>
        <Badge color={draft.status === "approved" ? "green" : "amber"}>
          {draft.status === "approved" ? "Подтверждён" : "Черновик"}
        </Badge>
      </Flex>
      {draft.requiredItems.map((item, index) => (
        <Card key={item.id} size="1" variant="surface">
          <Flex align="center" gap="2">
            <input
              type="checkbox"
              checked={item.approved}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  requiredItems: draft.requiredItems.map(
                    (current, currentIndex) =>
                      currentIndex === index
                        ? { ...current, approved: event.target.checked }
                        : current,
                  ),
                })
              }
            />
            <div className="flex-1">
              <TextField.Root
                value={item.label}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    requiredItems: draft.requiredItems.map(
                      (current, currentIndex) =>
                        currentIndex === index
                          ? { ...current, label: event.target.value }
                          : current,
                    ),
                  })
                }
              />
              <Text size="1" color="gray">
                {item.hint}
              </Text>
            </div>
            <Button
              size="1"
              color="red"
              variant="ghost"
              onClick={() =>
                setDraft({
                  ...draft,
                  requiredItems: draft.requiredItems.filter(
                    (_, currentIndex) => currentIndex !== index,
                  ),
                })
              }
            >
              Удалить
            </Button>
          </Flex>
        </Card>
      ))}
      <Flex gap="2" wrap="wrap">
        <Button variant="soft" onClick={() => save.mutate(false)}>
          Сохранить пункты
        </Button>
        <Button onClick={() => save.mutate(true)}>Подтвердить всё</Button>
      </Flex>
      <Flex gap="2">
        <TextField.Root
          className="flex-1"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Комментарий для повторной генерации"
        />
        <Button
          variant="soft"
          disabled={pending || comment.trim().length < 2}
          onClick={() => regenerate.mutate()}
        >
          Перегенерировать
        </Button>
      </Flex>
    </Card>
  );
}
