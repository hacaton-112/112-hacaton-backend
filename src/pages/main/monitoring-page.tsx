import { Callout, Flex, Heading, Skeleton, Tabs, Text } from "@bolid-ui/themes";
import { AlertTriangle } from "lucide-react";

import { InstructorCallsTable } from "../../components/training/instructor-calls-table";
import { LiveSessionsPanel } from "../../components/training/live-sessions-panel";
import {
  useInstructorCalls,
  useTrainingMutations,
} from "../../hooks/use-training";

/** Единое рабочее место преподавателя: живые попытки и завершённые разборы. */
export default function MonitoringPage() {
  const mutations = useTrainingMutations();
  const calls = useInstructorCalls();
  const finishedCalls =
    calls.data?.filter(
      ({ stage }) => stage === "ended" || stage === "declined",
    ) ?? [];

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div>
        <Heading size="6">Мониторинг занятий</Heading>
        <Text as="p" size="2" color="gray" mt="1">
          Следите за текущими попытками и открывайте результаты и записи
          учеников после завершения звонка.
        </Text>
      </div>

      <Tabs.Root defaultValue="live" className="flex min-h-0 flex-1 flex-col">
        <Tabs.List size="2">
          <Tabs.Trigger value="live">Активные попытки</Tabs.Trigger>
          <Tabs.Trigger value="results">
            Результаты{calls.data ? ` · ${finishedCalls.length}` : ""}
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="live" className="overflow-auto pt-4">
          <LiveSessionsPanel mutations={mutations} />
        </Tabs.Content>

        <Tabs.Content
          value="results"
          className="flex min-h-0 flex-1 flex-col gap-4 pt-4"
        >
          <Flex align="center" justify="between" gap="3" wrap="wrap">
            <Text size="2" color="gray">
              Последние завершённые попытки по доступным вам занятиям.
            </Text>
            {calls.isFetching && !calls.isPending && (
              <Text size="1" color="gray">
                Обновление…
              </Text>
            )}
          </Flex>

          {calls.error && (
            <Callout.Root color="red" role="alert">
              <Callout.Icon>
                <AlertTriangle size={16} />
              </Callout.Icon>
              <Callout.Text>
                Не удалось загрузить результаты: {calls.error.message}
              </Callout.Text>
            </Callout.Root>
          )}

          {calls.isPending ? (
            <Skeleton height="320px" className="rounded-xl" />
          ) : (
            <InstructorCallsTable
              calls={finishedCalls}
              backLabel="К мониторингу"
              showOperator
            />
          )}
        </Tabs.Content>
      </Tabs.Root>
    </main>
  );
}
