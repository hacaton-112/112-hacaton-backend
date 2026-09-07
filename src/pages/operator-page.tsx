import { Box, Flex } from "@bolid-ui/themes";

import { IncidentMap } from "../components/map/incident-map";
import { CallCard } from "../components/operator/call-card";
import { CallControlCard } from "../components/operator/call-control-card";
import { IncidentForm } from "../components/operator/incident-form";
import { MOSCOW } from "../config/map";
import type { IncidentCard } from "../contracts/incident";
import { useCall } from "../hooks/use-call";

export default function OperatorPage() {
  const call = useCall();

  const submitCard = (card: IncidentCard) => {
    // Появится, когда будет модуль incident-card на бэкенде.
    console.info("Карточка происшествия", card);
  };

  return (
    <Flex gap="3" p="3" className="h-full min-h-0">
      <Flex direction="column" gap="3" className="min-w-0 flex-1">
        <IncidentMap
          city={MOSCOW}
          incident={call.incident}
          className="rounded-4 border-grayA-4 min-h-60 flex-1 overflow-hidden border"
        />
        <Flex gap="3" className="shrink-0">
          <CallControlCard {...call} />
          <CallCard
            state={call.state}
            incident={call.incident}
            isResolvingAddress={call.isResolvingAddress}
            callerNumber={call.callerNumber}
            startedAt={call.startedAt}
          />
        </Flex>
      </Flex>

      <Box className="w-115 shrink-0 overflow-y-auto">
        <IncidentForm
          resolvedAddress={call.incident?.address}
          callerPhone={call.callerNumber}
          // До приёма вызова заполнять нечего; после завершения — можно дописать.
          disabled={call.state === "idle" || call.state === "ringing"}
          onSubmit={submitCard}
        />
      </Box>
    </Flex>
  );
}
