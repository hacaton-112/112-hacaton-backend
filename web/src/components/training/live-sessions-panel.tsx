import {
  Badge,
  Button,
  Callout,
  Card,
  DataList,
  Flex,
  Heading,
  Skeleton,
  Text,
  TextArea,
  toast,
} from "@bolid-ui/themes";
import { AlertTriangle, CircleStop, GraduationCap } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import { ROUTES } from "../../config/routes";
import type { LiveTrainingSession } from "../../contracts/training";
import {
  useLiveTrainingSessions,
  type TrainingMutations,
} from "../../hooks/use-training";
import { TrainingConfirmDialog } from "./training-confirm-dialog";
import { formatDuration, LIVE_STAGE_LABELS } from "./training-labels";

const MIN_REASON_LENGTH = 3;

/** Идущие звонки в реальном времени и остановка занятия оператора. */
export function LiveSessionsPanel({
  groupId,
  mutations,
}: {
  groupId?: string;
  mutations: TrainingMutations;
}) {
  const navigate = useNavigate();
  const sessions = useLiveTrainingSessions(groupId);
  const [sessionToEnd, setSessionToEnd] = useState<LiveTrainingSession>();
  const [reason, setReason] = useState("");

  const openEndDialog = (session: LiveTrainingSession) => {
    mutations.endSession.reset();
    setReason("");
    setSessionToEnd(session);
  };

  const endSession = async () => {
    if (!sessionToEnd || reason.trim().length < MIN_REASON_LENGTH) return;
    try {
      await mutations.endSession.mutateAsync({
        trainingSessionId: sessionToEnd.trainingSessionId,
        reason: reason.trim(),
      });
      setSessionToEnd(undefined);
      toast.success("Звонок оператора остановлен", {
        description: sessionToEnd.operatorName,
      });
    } catch {
      // Ошибка показана в диалоге.
    }
  };

  return (
    <div className="grid gap-4">
      <Text size="2" color="gray">
        {groupId
          ? "Звонки учеников группы"
          : "Звонки учеников ваших групп и индивидуальных занятий"}
        , список обновляется каждые две секунды.
      </Text>

      {sessions.error && (
        <Callout.Root color="red" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>
            Не удалось обновить активные попытки: {sessions.error.message}
          </Callout.Text>
        </Callout.Root>
      )}

      {sessions.isPending && <Skeleton height="220px" className="rounded-(--radius-4)" />}

      {sessions.data?.length === 0 && (
        <Card size="3">
          <Text color="gray">Сейчас никто из обучающихся не в звонке.</Text>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sessions.data?.map((session) => (
          <Card key={session.trainingSessionId} size="3" className="grid gap-3">
            <Flex align="start" justify="between" gap="2">
              <div className="min-w-0">
                <Heading as="h3" size="3">
                  {session.operatorName}
                </Heading>
                <Text as="p" size="1" color="gray">
                  {session.assignmentTitle}
                </Text>
              </div>
              <Badge color={session.stage === "offered" ? "amber" : "green"}>
                {LIVE_STAGE_LABELS[session.stage]}
              </Badge>
            </Flex>

            <DataList.Root size="2">
              {!groupId && (
                <DataList.Item>
                  <DataList.Label>Группа</DataList.Label>
                  <DataList.Value>
                    {session.groupName ?? "Индивидуально"}
                  </DataList.Value>
                </DataList.Item>
              )}
              <DataList.Item>
                <DataList.Label>Сценарий</DataList.Label>
                <DataList.Value>
                  {session.scenarioCode} · {session.scenarioTitle}
                </DataList.Value>
              </DataList.Item>
              <DataList.Item>
                <DataList.Label>В звонке</DataList.Label>
                <DataList.Value>
                  {formatDuration(session.elapsedSeconds)}
                </DataList.Value>
              </DataList.Item>
              <DataList.Item>
                <DataList.Label>Ступень паники</DataList.Label>
                <DataList.Value>{session.panicLevel} из 4</DataList.Value>
              </DataList.Item>
              <DataList.Item>
                <DataList.Label>Обязательные вопросы</DataList.Label>
                <DataList.Value>
                  {session.checklistSatisfied} из {session.checklistTotal}
                </DataList.Value>
              </DataList.Item>
            </DataList.Root>

            <Flex gap="2" wrap="wrap">
              <Button
                color="gray"
                variant="soft"
                onClick={() => navigate(ROUTES.student(session.operatorId))}
              >
                <GraduationCap size={15} /> Ученик
              </Button>
              <Button
                color="red"
                variant="soft"
                onClick={() => openEndDialog(session)}
              >
                <CircleStop size={15} /> Остановить звонок
              </Button>
            </Flex>
          </Card>
        ))}
      </div>

      <TrainingConfirmDialog
        open={sessionToEnd !== undefined}
        onOpenChange={(open) => !open && setSessionToEnd(undefined)}
        title="Остановить звонок оператора?"
        description={
          <>
            Звонок <strong>{sessionToEnd?.operatorName}</strong> завершится
            сразу, попытка получит статус «остановлена преподавателем». Причина
            попадёт в журнал занятия и аудит.
          </>
        }
        confirmLabel="Остановить"
        pending={mutations.endSession.isPending}
        confirmDisabled={reason.trim().length < MIN_REASON_LENGTH}
        error={mutations.endSession.error?.message}
        onConfirm={() => void endSession()}
      >
        <TextArea
          autoFocus
          placeholder="Причина, например «время занятия вышло»"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </TrainingConfirmDialog>
    </div>
  );
}
