import { Badge, Button, Callout, Card, Flex, Text } from "@bolid-ui/themes";
import { useQueryClient } from "@tanstack/react-query";
import { PhoneCall } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { DdsCrewHandoff } from "../../contracts/dds-exercise";
import {
  prepareDirectCrewPhoneWindow,
  type DirectCrewPhoneWindowSession,
} from "../../lib/direct-crew-phone-window";
import { getAccessToken } from "../../stores/auth.store";

/** Открывает отдельный прямой браузерный телефон для текущей карточки ДДС. */
export function DdsPhonePanel({
  exerciseId,
  handoff,
  canCall,
}: {
  exerciseId: string;
  handoff: DdsCrewHandoff;
  canCall: boolean;
}) {
  const client = useQueryClient();
  const [windowError, setWindowError] = useState<string>();
  const [opening, setOpening] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const phoneWindow = useRef<DirectCrewPhoneWindowSession | null>(null);
  const unsubscribeCallState = useRef<(() => void) | null>(null);
  const callableCrews = useMemo(
    () =>
      handoff.callMode === "progress_check" && handoff.selectedCrewPhoneNumber
        ? handoff.crews.filter(
            ({ phoneNumber }) =>
              phoneNumber === handoff.selectedCrewPhoneNumber,
          )
        : handoff.crews,
    [handoff.callMode, handoff.crews, handoff.selectedCrewPhoneNumber],
  );

  useEffect(
    () => () => {
      unsubscribeCallState.current?.();
      phoneWindow.current?.dispose();
      phoneWindow.current = null;
    },
    [],
  );

  useEffect(() => {
    phoneWindow.current?.setContext(exerciseId, callableCrews, canCall);
  }, [exerciseId, callableCrews, canCall]);

  const openPhone = async () => {
    setWindowError(undefined);
    setOpening(true);
    let session: DirectCrewPhoneWindowSession | undefined;

    try {
      const token = getAccessToken();
      if (!token) throw new Error("Сессия входа истекла. Войдите снова.");

      session = prepareDirectCrewPhoneWindow();
      await session.connect(token);
      unsubscribeCallState.current?.();
      phoneWindow.current?.dispose();
      phoneWindow.current = session;
      session.setContext(exerciseId, callableCrews, canCall);
      unsubscribeCallState.current = session.onCallState((state, message) => {
        setCallActive(state === "connected");
        if (state === "error" && message) setWindowError(message);
        if (state === "ended" || state === "error") {
          void client.invalidateQueries({ queryKey: ["dds-exercises"] });
        }
      });
    } catch (reason) {
      session?.dispose();
      setWindowError(
        reason instanceof Error
          ? reason.message
          : "Не удалось открыть окно телефона",
      );
    } finally {
      setOpening(false);
    }
  };

  return (
    <Card size="2" variant="classic" className="arm-dds-phone-panel grid gap-3">
      <Flex align="center" justify="between" gap="2" wrap="wrap">
        <Flex align="center" gap="2">
          <PhoneCall size={17} />
          <Text size="2" weight="bold">
            Телефон ДДС
          </Text>
        </Flex>
        <Badge color={callActive ? "green" : "gray"} variant="soft">
          {callActive ? "Идёт разговор" : "Прямой канал"}
        </Badge>
      </Flex>

      <Button color="green" loading={opening} onClick={() => void openPhone()}>
        <PhoneCall size={16} /> Открыть телефон
      </Button>

      <Text size="1" className="arm-dds-phone-help">
        {canCall
          ? handoff.callMode === "progress_check"
            ? "Позвоните выбранному наряду и получите контрольный доклад."
            : "Выберите наряд и передайте карточку голосом. SIP-регистрация не требуется."
          : "Откройте телефон заранее; звонок станет доступен после принятия карточки."}
      </Text>

      {windowError && (
        <Callout.Root color="red" role="alert">
          <Callout.Text>{windowError}</Callout.Text>
        </Callout.Root>
      )}
    </Card>
  );
}
