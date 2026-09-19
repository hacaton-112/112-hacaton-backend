import { Button, Flex, Text } from "@bolid-ui/themes";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { DialoguePreparation } from "../../contracts/dialogue-preparation";
import { api } from "../../lib/api";
const ROOT = "/scenarios/dialogue-preparations";
export function DialogueAudioPreview({
  id,
  previews,
}: {
  id: string;
  previews: DialoguePreparation["previews"];
}) {
  const [index, setIndex] = useState(0);
  const [url, setUrl] = useState<string>();
  const lastUrl = useRef<string | undefined>(undefined);
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current += 1;
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    },
    [],
  );
  const audio = useMutation({
    mutationFn: async () => {
      const token = ++request.current;
      const blob = await api.get<Blob>(`${ROOT}/${id}/audio/${index}`, {
        responseType: "blob",
      });
      if (token !== request.current) return;
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
      lastUrl.current = URL.createObjectURL(blob);
      setUrl(lastUrl.current);
    },
  });
  return (
    <Flex direction="column" gap="2">
      <label>
        Прослушать запись
        <select
          aria-label="Запись для прослушивания"
          value={index}
          onChange={(event) => {
            request.current += 1;
            setIndex(Number(event.target.value));
            setUrl(undefined);
          }}
        >
          {previews.map((item) => (
            <option key={item.index} value={item.index} disabled={!item.ready}>
              {item.index + 1}. {item.text}
            </option>
          ))}
        </select>
      </label>
      <Button
        type="button"
        variant="soft"
        disabled={!previews[index]?.ready || audio.isPending}
        onClick={() => audio.mutate()}
      >
        Загрузить для прослушивания
      </Button>
      {audio.isError && <Text color="red">Не удалось загрузить запись.</Text>}
      {url && (
        <audio controls src={url} aria-label="Подготовленный ответ заявителя" />
      )}
    </Flex>
  );
}
