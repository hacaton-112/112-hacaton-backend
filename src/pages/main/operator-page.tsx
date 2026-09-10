import { ScrollArea, toast } from "@bolid-ui/themes";
import { useEffect } from "react";

import { CallerPanel } from "../../components/operator/caller-panel";
import { DispatchCallPanel } from "../../components/operator/dispatch-call-panel";
import { IncidentForm } from "../../components/operator/incident-form";
import { useCall } from "../../hooks/use-call";
import { useIncidentCard } from "../../hooks/use-incident-card";

export default function OperatorPage() {
  const call = useCall();
  const incidentCard = useIncidentCard(
    call.trainingSessionId,
    call.state === "ended",
  );

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
    <div className="bg-gray-2 h-full min-h-0 overflow-hidden">
      <ScrollArea
        className="operator-page-scroll h-full min-h-0"
        scrollbars="vertical"
        type="auto"
      >
        <div className="operator-workspace grid min-h-full grid-cols-1 gap-4 p-4 min-[1480px]:h-full min-[1480px]:min-h-0 min-[1480px]:grid-cols-[minmax(360px,0.92fr)_minmax(650px,1.95fr)_minmax(380px,1fr)] min-[1480px]:grid-rows-1 md:grid-cols-[minmax(340px,0.47fr)_minmax(560px,1fr)]">
          <ScrollArea
            className="operator-column-scroll min-h-0"
            scrollbars="vertical"
            type="auto"
          >
            <CallerPanel
              callerNumber={call.callerNumber}
              startedAt={call.startedAt}
            />
          </ScrollArea>
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
                resolvedAddress={call.incident?.address}
                resolvedLatitude={call.incident?.latitude}
                resolvedLongitude={call.incident?.longitude}
                card={incidentCard.card}
                // До приёма вызова заполнять нечего, после завершения карточку
                // закрывает backend: дописанное после разговора не оценивается.
                disabled={
                  call.state === "idle" ||
                  call.state === "ringing" ||
                  call.state === "ended"
                }
                onChange={incidentCard.change}
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
            />
          </ScrollArea>
        </div>
      </ScrollArea>
    </div>
  );
}
