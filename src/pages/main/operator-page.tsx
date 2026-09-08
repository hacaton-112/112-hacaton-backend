import { ScrollArea, Separator } from "@bolid-ui/themes";

import { CallerPanel } from "../../components/operator/caller-panel";
import { DispatchCallPanel } from "../../components/operator/dispatch-call-panel";
import { IncidentForm } from "../../components/operator/incident-form";
import type { IncidentCard } from "../../contracts/incident";
import { useCall } from "../../hooks/use-call";

export default function OperatorPage() {
  const call = useCall();

  const submitCard = (card: IncidentCard) => {
    // Появится, когда будет модуль incident-card на бэкенде.
    console.info("Карточка происшествия", card);
  };

  return (
    <div className="bg-gray-1 h-full min-h-0 overflow-hidden">
      <ScrollArea
        className="operator-page-scroll h-full min-h-0"
        scrollbars="vertical"
        type="auto"
      >
        <div className="border-grayA-5 grid min-h-full grid-cols-1 border-t md:grid-cols-[minmax(250px,0.75fr)_minmax(440px,1.25fr)] lg:h-full lg:min-h-0 lg:grid-cols-[minmax(220px,0.78fr)_minmax(400px,1.35fr)_1px_minmax(300px,1fr)] lg:grid-rows-1">
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
              className="bg-background min-h-full min-w-0"
              aria-label="Карточка происшествия"
            >
              <IncidentForm
                resolvedAddress={call.incident?.address}
                callerPhone={call.callerNumber}
                // До приёма вызова заполнять нечего; после завершения — можно дописать.
                disabled={call.state === "idle" || call.state === "ringing"}
                onSubmit={submitCard}
              />
            </main>
          </ScrollArea>
          <Separator
            orientation="vertical"
            size="4"
            className="hidden h-full lg:block"
          />
          <DispatchCallPanel {...call} />
        </div>
      </ScrollArea>
    </div>
  );
}
