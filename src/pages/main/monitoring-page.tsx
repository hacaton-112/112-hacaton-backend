import {
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Skeleton,
  Tabs,
  Text,
} from "@bolid-ui/themes";
import { AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router";

import { ROUTES } from "../../config/routes";
import { DdsLiveAttempts } from "../../components/dds/dds-live-attempts";
import { DdsLessonsPanel } from "../../components/dds/dds-lessons-panel";
import { InstructorCallsTable } from "../../components/training/instructor-calls-table";
import { VoiceRuntimeStatus } from "../../components/training/voice-runtime-status";
import { LiveSessionsPanel } from "../../components/training/live-sessions-panel";
import {
  useInstructorCalls,
  useTrainingMutations,
} from "../../hooks/use-training";

/** Единое рабочее место преподавателя: живые попытки и завершённые разборы. */
export default function MonitoringPage() {
  const navigate = useNavigate();
  const mutations = useTrainingMutations();
  const calls = useInstructorCalls();
  const finishedCalls =
    calls.data?.filter(
      ({ stage }) => stage === "ended" || stage === "declined",
    ) ?? [];

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 md:p-6">
      <div className="shrink-0">
        <Heading size="6">Мониторинг занятий</Heading>
        <Text as="p" size="2" color="gray" mt="1">
          Следите за текущими попытками и открывайте результаты и записи
          учеников после завершения звонка.
        </Text>
      </div>

      <div className="shrink-0">
        <VoiceRuntimeStatus />
      </div>
      <Tabs.Root defaultValue="live" className="flex min-h-0 flex-1 flex-col">
        <Tabs.List size="2" className="shrink-0">
          <Tabs.Trigger value="dds-lessons">Занятия ДДС</Tabs.Trigger>
          <Tabs.Trigger value="live">Активные попытки</Tabs.Trigger>
          <Tabs.Trigger value="results">
            Результаты{calls.data ? ` · ${finishedCalls.length}` : ""}
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content
          value="live"
          className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto pt-4"
        >
          <LiveSessionsPanel mutations={mutations} />
          <DdsLiveAttempts />
        </Tabs.Content>

        <Tabs.Content
          value="dds-lessons"
          className="min-h-0 flex-1 overflow-auto pt-4"
        >
          <DdsLessonsPanel />
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

          <Card size="2" variant="surface">
            <Flex align="center" justify="between" gap="3" wrap="wrap">
              <div>
                <Text as="p" weight="bold">
                  Результаты карточек ДДС
                </Text>
                <Text as="p" size="2" color="gray">
                  Назначенные попытки и диагностические карточки вне занятия
                  находятся в рабочем месте ДДС.
                </Text>
              </div>
              <Button variant="soft" onClick={() => navigate(ROUTES.dds())}>
                Открыть результаты ДДС
              </Button>
            </Flex>
          </Card>

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
            <Skeleton height="320px" className="rounded-(--radius-4)" />
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
