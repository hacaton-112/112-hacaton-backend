import { Badge, Button, Callout, Card, Flex, Text } from "@bolid-ui/themes";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PhoneCall } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { DdsCrewHandoff } from "../../contracts/dds-exercise";
import {
  prepareBrowserPhoneWindow,
  type BrowserPhoneWindowSession,
} from "../../lib/browser-phone-window";
import { telephonyService } from "../../services/telephony.service";
import { isOfferedCrewNumber } from "./dds-phone";

/**
 * Телефон диспетчера стоит отдельным аппаратом.
 *
 * На карточке его нет: в реальном ДДС диспетчер не набирает номер в карточке
 * происшествия, а снимает трубку рядом. Здесь остаётся кнопка, которая
 * открывает окно телефона и передаёт ему наряды этой карточки; набор, вызов и
 * разговор идут уже там.
 */
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
  const command = useRef<{ number: string; eventId: string } | null>(null);
  // Аппарат, открытый рядом с рабочим местом: живёт, пока открыта карточка.
  const phoneWindow = useRef<BrowserPhoneWindowSession | null>(null);
  const dialContext = useRef({ handoff, canCall });
  const unsubscribeDial = useRef<(() => void) | null>(null);
  const callsBeforeCommand = useRef<number | null>(null);
  const call = useMutation({
    mutationFn: async (dialedNumber: string) => {
      callsBeforeCommand.current ??= handoff.calls.length;
      if (command.current?.number !== dialedNumber) {
        command.current = {
          number: dialedNumber,
          eventId: crypto.randomUUID(),
        };
      }

      return await telephonyService.startCrewCall(exerciseId, {
        eventId: command.current.eventId,
        dialedNumber,
      });
    },
    retry: false,
    onSuccess: async (receipt) => {
      command.current = null;
      phoneWindow.current?.notify(
        "sent",
        `Asterisk вызывает аппарат ${receipt.workstationExtension}. Ответьте и передайте карточку наряду.`,
      );
      await client.invalidateQueries({ queryKey: ["dds-exercises"] });
    },
    onError: (error: Error) => {
      phoneWindow.current?.notify("error", error.message);
    },
  });
  const activeCall = useRef(call);
  const latestCall = handoff.calls.at(-1);

  useEffect(
    () => () => {
      unsubscribeDial.current?.();
      phoneWindow.current?.dispose();
      phoneWindow.current = null;
    },
    [],
  );

  // Справочник карточки и право звонить меняются по ходу упражнения, и
  // открытый аппарат должен видеть их такими же, как рабочее место.
  useEffect(() => {
    dialContext.current = { handoff, canCall };
    activeCall.current = call;
    phoneWindow.current?.setContext(handoff.crews, canCall);
  }, [call, handoff, canCall]);

  useEffect(() => {
    if (
      call.isSuccess &&
      callsBeforeCommand.current !== null &&
      handoff.calls.length > callsBeforeCommand.current &&
      latestCall?.endedAt
    ) {
      callsBeforeCommand.current = null;
      call.reset();
    }
  }, [call, handoff.calls.length, latestCall?.endedAt]);

  const openPhone = async () => {
    setWindowError(undefined);
    setOpening(true);
    let session: BrowserPhoneWindowSession | undefined;

    try {
      session = prepareBrowserPhoneWindow();
      await session.connect(await telephonyService.getBrowserPhoneConfig());
      unsubscribeDial.current?.();
      phoneWindow.current?.dispose();
      phoneWindow.current = session;
      session.setContext(handoff.crews, canCall);
      const connectedSession = session;
      // Номер набирают в окне аппарата, а вызов ставит карточка: только она
      // знает, к какому упражнению его отнести.
      unsubscribeDial.current = connectedSession.onDial((dialed) => {
        const current = dialContext.current;
        if (!current.canCall) {
          connectedSession.notify("error", "Сначала примите карточку");
          return;
        }
        if (!isOfferedCrewNumber(current.handoff, dialed)) {
          connectedSession.notify(
            "error",
            "По этой карточке можно вызвать только наряд из справочника",
          );
          return;
        }
        if (activeCall.current.isPending || activeCall.current.isSuccess) {
          connectedSession.notify("error", "Предыдущий вызов ещё не завершён");
          return;
        }

        activeCall.current.mutate(dialed);
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
        <Badge color={call.isSuccess ? "green" : "gray"} variant="soft">
          {call.isSuccess ? "Вызов отправлен" : "Отдельный аппарат"}
        </Badge>
      </Flex>

      <Button color="green" loading={opening} onClick={() => void openPhone()}>
        <PhoneCall size={16} /> Открыть телефон
      </Button>

      <Text size="1" className="arm-dds-phone-help">
        {canCall
          ? "Наряды и набор номера — в окне телефона."
          : "Откройте аппарат заранее; звонок станет доступен после принятия карточки."}
      </Text>

      {call.error && (
        <Callout.Root color="red" role="alert">
          <Callout.Text>{call.error.message}</Callout.Text>
        </Callout.Root>
      )}
      {windowError && (
        <Callout.Root color="red" role="alert">
          <Callout.Text>{windowError}</Callout.Text>
        </Callout.Root>
      )}
    </Card>
  );
}
