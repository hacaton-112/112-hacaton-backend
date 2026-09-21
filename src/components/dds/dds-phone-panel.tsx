import {
  Badge,
  Button,
  Callout,
  Card,
  Flex,
  Text,
  TextField,
} from "@bolid-ui/themes";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Delete, PhoneCall, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { DdsCrewHandoff } from "../../contracts/dds-exercise";
import {
  prepareBrowserPhoneWindow,
  type BrowserPhoneWindowSession,
} from "../../lib/browser-phone-window";
import { telephonyService } from "../../services/telephony.service";
import { isOfferedCrewNumber, normalizeDialedNumber } from "./dds-phone";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

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
  const [number, setNumber] = useState(handoff.crews[0]?.phoneNumber ?? "");
  const [windowError, setWindowError] = useState<string>();
  const command = useRef<{ number: string; eventId: string } | null>(null);
  // Аппарат, открытый рядом с рабочим местом: живёт, пока открыта карточка.
  const phoneWindow = useRef<BrowserPhoneWindowSession | null>(null);
  const unsubscribeDial = useRef<(() => void) | null>(null);
  const callsBeforeCommand = useRef<number | null>(null);
  const call = useMutation({
    mutationFn: async (input: {
      phoneWindow: BrowserPhoneWindowSession;
      dialedNumber?: string;
      /** Открытый рядом аппарат закрывать нельзя: он живёт между звонками. */
      keepOpen?: boolean;
    }) => {
      const dialedNumber = input.dialedNumber ?? number;

      try {
        const phoneConfig = await telephonyService.getBrowserPhoneConfig();
        await input.phoneWindow.connect(phoneConfig);
        callsBeforeCommand.current ??= handoff.calls.length;
        if (command.current?.number !== dialedNumber) {
          command.current = { number: dialedNumber, eventId: crypto.randomUUID() };
        }
        return await telephonyService.startCrewCall(exerciseId, {
          eventId: command.current.eventId,
          dialedNumber,
        });
      } finally {
        if (!input.keepOpen) input.phoneWindow.dispose();
      }
    },
    retry: false,
    onSuccess: async () => {
      command.current = null;
      await client.invalidateQueries({ queryKey: ["dds-exercises"] });
    },
  });
  const latestCall = handoff.calls.at(-1);

  useEffect(
    () => () => {
      unsubscribeDial.current?.();
      phoneWindow.current?.dispose();
      phoneWindow.current = null;
    },
    [],
  );

  const openPhoneWindow = async () => {
    setWindowError(undefined);

    try {
      const session = prepareBrowserPhoneWindow();
      await session.connect(await telephonyService.getBrowserPhoneConfig());
      unsubscribeDial.current?.();
      phoneWindow.current?.dispose();
      phoneWindow.current = session;
      // Номер набирают в окне аппарата, а вызов ставит карточка.
      unsubscribeDial.current = session.onDial((dialed) => {
        setNumber(dialed);
        call.mutate({
          phoneWindow: session,
          dialedNumber: dialed,
          keepOpen: true,
        });
      });
    } catch (reason) {
      setWindowError(
        reason instanceof Error
          ? reason.message
          : "Не удалось открыть окно телефона",
      );
    }
  };

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
  const offered = isOfferedCrewNumber(handoff, number);

  return (
    <Card
      size="2"
      variant="classic"
      className="bg-gray-12 grid gap-3 text-white"
    >
      <Flex align="center" justify="between" gap="2" wrap="wrap">
        <Flex align="center" gap="2">
          <PhoneCall size={17} />
          <Text size="2" weight="bold">
            Телефон ДДС
          </Text>
        </Flex>
        <Flex align="center" gap="2">
          <Button
            size="1"
            variant="soft"
            color="gray"
            disabled={!canCall}
            onClick={() => void openPhoneWindow()}
          >
            Открыть телефон
          </Button>
          <Badge color={call.isSuccess ? "green" : "gray"} variant="soft">
            {call.isSuccess ? "Вызов отправлен" : "Готов"}
          </Badge>
        </Flex>
      </Flex>

      <div className="rounded-(--radius-2) bg-black/50 p-2">
        <Text size="1" color="gray">
          Номер наряда
        </Text>
        <TextField.Root
          aria-label="Номер наряда"
          inputMode="numeric"
          value={number}
          onChange={(event) => {
            setNumber(normalizeDialedNumber(event.currentTarget.value));
            setWindowError(undefined);
            call.reset();
          }}
          className="mt-1 font-mono text-lg tabular-nums"
        />
      </div>

      <div
        className="grid grid-cols-3 gap-1.5"
        aria-label="Клавиатура телефона"
      >
        {KEYS.slice(0, 9).map((key) => (
          <Button
            key={key}
            variant="soft"
            color="gray"
            onClick={() => {
              setNumber((current) => normalizeDialedNumber(`${current}${key}`));
              setWindowError(undefined);
              call.reset();
            }}
          >
            {key}
          </Button>
        ))}
        <Button
          aria-label="Очистить номер"
          variant="soft"
          color="gray"
          onClick={() => {
            setNumber("");
            setWindowError(undefined);
            call.reset();
          }}
        >
          <X size={16} />
        </Button>
        <Button
          variant="soft"
          color="gray"
          onClick={() => {
            setNumber((current) => normalizeDialedNumber(`${current}0`));
            setWindowError(undefined);
            call.reset();
          }}
        >
          0
        </Button>
        <Button
          aria-label="Удалить последнюю цифру"
          variant="soft"
          color="gray"
          onClick={() => {
            setNumber((current) => current.slice(0, -1));
            setWindowError(undefined);
            call.reset();
          }}
        >
          <Delete size={16} />
        </Button>
      </div>

      <div className="grid gap-1">
        {handoff.crews.map((crew) => (
          <Button
            key={crew.phoneNumber}
            size="1"
            variant={number === crew.phoneNumber ? "solid" : "soft"}
            onClick={() => {
              setNumber(crew.phoneNumber);
              setWindowError(undefined);
              call.reset();
            }}
          >
            {crew.callsign} · {crew.phoneNumber}
          </Button>
        ))}
      </div>

      {!canCall && (
        <Text size="1" color="gray">
          Сначала примите карточку. После этого станет доступен звонок наряду.
        </Text>
      )}
      {number && !offered && (
        <Text size="1" color="amber">
          Для этой карточки можно вызвать только наряд из справочника выше.
        </Text>
      )}
      <Button
        color="green"
        disabled={!canCall || !offered || call.isPending || call.isSuccess}
        loading={call.isPending}
        onClick={() => {
          setWindowError(undefined);
          try {
            const session = phoneWindow.current;
            call.mutate(
              session
                ? { phoneWindow: session, keepOpen: true }
                : { phoneWindow: prepareBrowserPhoneWindow() },
            );
          } catch (error) {
            setWindowError(
              error instanceof Error
                ? error.message
                : "Не удалось открыть окно телефона",
            );
          }
        }}
      >
        <PhoneCall size={16} /> Позвонить
      </Button>

      {call.data && (
        <Callout.Root color="green">
          <Callout.Text>
            Asterisk вызывает окно телефона рабочего места{" "}
            {call.data.workstationExtension}. Нажмите «Ответить» и передайте
            карточку наряду.
          </Callout.Text>
        </Callout.Root>
      )}
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
