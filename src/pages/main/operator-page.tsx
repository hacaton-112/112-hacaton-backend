import { ScrollArea, toast } from "@bolid-ui/themes";
import { useEffect, useState } from "react";

import { CallerPanel } from "../../components/operator/caller-panel";
import { CallControlDock } from "../../components/operator/call-control-dock";
import { DispatchCallPanel } from "../../components/operator/dispatch-call-panel";
import { IncidentForm } from "../../components/operator/incident-form";
import { OperatorHeader } from "../../components/operator/operator-header";
import { useCall } from "../../hooks/use-call";
import { useIncidentCard } from "../../hooks/use-incident-card";
import { useAuthStore } from "../../stores/auth.store";

export default function OperatorPage() {
  const call = useCall();
  const operatorName =
    useAuthStore((state) => state.user?.fullName) ?? "Оператор";
  const [isEnding, setEnding] = useState(false);
  const incidentCard = useIncidentCard({
    trainingSessionId: call.trainingSessionId,
    isCallOver: call.state === "ended",
    locationDefaults: call.incident
      ? {
          addressText: call.incident.address,
          latitude: call.incident.latitude,
          longitude: call.incident.longitude,
        }
      : undefined,
  });

  const handleEnd = async () => {
    setEnding(true);

    try {
      // Backend закрывает карточку вместе со звонком, поэтому debounce должен
      // завершиться раньше команды end.
      await incidentCard.flush();
      await call.end();
    } catch {
      // Оба hook уже показали пользователю предметную ошибку. Звонок остаётся
      // активным, чтобы оператор мог повторить сохранение и завершение.
    } finally {
      setEnding(false);
    }
  };

  const callerName = (() => {
    if (incidentCard.card?.callerAnonymous) return "Анонимный заявитель";

    const fullName = [
      incidentCard.card?.callerLastName,
      incidentCard.card?.callerFirstName,
      incidentCard.card?.callerMiddleName,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      fullName ||
      incidentCard.card?.callerPhone ||
      call.callerNumber ||
      "Заявитель"
    );
  })();
  const isCardEditable =
    call.state === "active" && Boolean(incidentCard.card) && !isEnding;

  useEffect(() => {
    if (!call.error) return;

    toast.error(call.isConnected ? "Ошибка звонка" : "Сервер недоступен", {
      id: "call-server-error",
      description: call.error,
      duration: 6_000,
    });
  }, [call.error, call.isConnected]);

  useEffect(() => {
    if (!incidentCard.error) return;

    toast.error("Карточка не сохранена", {
      id: "incident-card-error",
      description: incidentCard.error,
      duration: 6_000,
    });
  }, [incidentCard.error]);

  return (
    <div className="bg-gray-2 relative flex h-full min-h-0 flex-col overflow-hidden">
      <OperatorHeader
        state={call.state}
        scenarioTitle={call.scenarioTitle}
        scenarioDifficulty={call.scenarioDifficulty}
        operatorName={operatorName}
      />
      <ScrollArea
        className="operator-page-scroll min-h-0 flex-1"
        scrollbars="vertical"
        type="auto"
      >
        <div className="operator-workspace grid min-h-full grid-cols-1 gap-4 p-4 min-[1480px]:h-full min-[1480px]:min-h-0 min-[1480px]:grid-cols-[minmax(360px,0.92fr)_minmax(650px,1.95fr)_minmax(380px,1fr)] min-[1480px]:grid-rows-1 md:grid-cols-[minmax(340px,0.47fr)_minmax(560px,1fr)]">
          <div className="h-[calc(100dvh_-_var(--app-titlebar-height)_-_38px_-_var(--space-4)_-_var(--space-4))] min-h-[44rem] overflow-hidden">
            <CallerPanel
              trainingSessionId={call.trainingSessionId}
              callerNumber={call.callerNumber}
              startedAt={call.startedAt}
              operatorName={operatorName}
              card={incidentCard.card}
              disabled={!isCardEditable}
              onChange={incidentCard.update}
            />
          </div>
          <ScrollArea
            className="operator-column-scroll min-h-0"
            scrollbars="vertical"
            type="auto"
          >
            <main
              className="operator-incident-column min-h-full min-w-0"
              aria-label="Карточка происшествия"
            >
              <IncidentForm
                sessionId={call.trainingSessionId}
                card={incidentCard.card}
                // До приёма вызова заполнять нечего, после завершения карточку
                // закрывает backend: дописанное после разговора не оценивается.
                disabled={!isCardEditable}
                onChange={incidentCard.update}
              />
            </main>
          </ScrollArea>
          <ScrollArea
            className="operator-column-scroll min-h-0 min-[1480px]:col-span-1 md:col-span-2"
            scrollbars="vertical"
            type="auto"
          >
            <DispatchCallPanel
              {...call}
              services={incidentCard.services}
              onToggleService={incidentCard.toggleService}
              callerName={callerName}
              isCardReady={Boolean(incidentCard.card)}
              isEnding={isEnding}
            />
          </ScrollArea>
        </div>
      </ScrollArea>
      <CallControlDock
        {...call}
        isCardReady={Boolean(incidentCard.card)}
        isEnding={isEnding}
        onEnd={() => void handleEnd()}
      />
    </div>
  );
}
