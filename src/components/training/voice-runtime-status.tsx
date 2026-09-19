import { Flex, Text } from "@bolid-ui/themes";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "../../config/query-keys";
import { voiceOutcomeLabel } from "../../contracts/voice-runtime";
import { getVoiceRuntime } from "../../services/voice-runtime.service";

export function VoiceRuntimeStatus() {
  const query = useQuery({
    queryKey: QUERY_KEYS.voiceRuntime(),
    queryFn: ({ signal }) => getVoiceRuntime(signal),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  if (query.isError)
    return (
      <Text size="2" color="gray" role="status">
        Сведения об обработке голоса временно недоступны.
      </Text>
    );
  if (!query.data)
    return (
      <Text size="2" color="gray" role="status">
        Загрузка состояния голосового режима…
      </Text>
    );
  if (query.data.profile === "standard")
    return (
      <Text size="2" color="gray">
        Обычный голосовой режим. Локальный гибридный режим не включён на
        сервере.
      </Text>
    );
  return (
    <section
      aria-label="Голосовой режим"
      className="rounded-lg border border-(--gray-6) p-3"
    >
      <Text as="p" weight="medium">
        Локальный гибридный режим
      </Text>
      <Text as="p" size="2">
        Готовые ответы используются первыми. На нестандартный ответ — до{" "}
        {query.data.exceptionBudgetMs / 1000} сек.; затем используется
        безопасная запись. Загрузка записи и пауза заявителя учитываются
        отдельно.
      </Text>
      <Flex gap="3" wrap="wrap" mt="2">
        {Object.entries(query.data.outcomes).map(([key, value]) => (
          <Text size="2" key={key}>
            {voiceOutcomeLabel(key)}: {value}
          </Text>
        ))}
      </Flex>
      <Text as="p" size="1" mt="1">
        Счётчики всех звонков текущего процесса сервера, сбрасываются при
        перезапуске. Это не проверка доступности моделей и не оценка ученика.
      </Text>
    </section>
  );
}
