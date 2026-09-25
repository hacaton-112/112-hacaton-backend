import {
  Badge,
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Text,
} from "@bolid-ui/themes";
import { AlertTriangle, PhoneCall, PhoneOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { BrowserPhoneConfig } from "../../contracts/telephony";
import {
  formatBrowserPhoneError,
  PHONE_CHANNEL_NAME,
  PhoneHostMessageSchema,
  type PhoneCrewEntry,
  type PhoneWindowMessage,
} from "../../lib/browser-phone-window";
import { BrowserPhoneClient } from "../../services/browser-phone.service";

type PhoneState =
  | "waiting"
  | "connecting"
  | "registered"
  | "dialing"
  | "ringing"
  | "answering"
  | "connected"
  | "ended"
  | "error";

const DIAL_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

const STATE_LABELS: Record<PhoneState, string> = {
  waiting: "Ожидание рабочего места",
  connecting: "Подключение к АТС",
  registered: "Готов к звонку",
  dialing: "Вызов наряда",
  ringing: "Входящий звонок",
  answering: "Подключение микрофона",
  connected: "Разговор",
  ended: "Звонок завершён",
  error: "Ошибка",
};

export default function BrowserPhonePage() {
  const [state, setState] = useState<PhoneState>("waiting");
  const [extension, setExtension] = useState<string>();
  const [error, setError] = useState<string>();
  const audioRef = useRef<HTMLAudioElement>(null);
  const phoneRef = useRef<BrowserPhoneClient | null>(null);
  // Окно живёт рядом с рабочим местом, поэтому номер набирают здесь, а звонок
  // ставит карточка: у неё есть упражнение, к которому относится вызов.
  const [number, setNumber] = useState("");
  // Наряды приходят из карточки: телефон сам не знает, по какому она
  // происшествию, и справочник у него всегда от текущей карточки.
  const [crews, setCrews] = useState<readonly PhoneCrewEntry[]>([]);
  const [canCall, setCanCall] = useState(false);
  const [hostStatus, setHostStatus] = useState<{
    kind: "sent" | "error";
    message: string;
  }>();
  const channelRef = useRef<BroadcastChannel | null>(null);
  const requestIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const channel = new BroadcastChannel(PHONE_CHANNEL_NAME);
    channelRef.current = channel;

    const publish = (message: PhoneWindowMessage) =>
      channel.postMessage(message);
    const fail = (requestId: string, message: string) => {
      setState("error");
      setError(message);
      publish({ type: "error", requestId, message });
    };
    const configure = async (requestId: string, config: BrowserPhoneConfig) => {
      requestIdRef.current = requestId;
      setExtension(config.extension);
      setError(undefined);
      setState("connecting");

      if (!window.isSecureContext) {
        fail(
          requestId,
          "WebRTC-телефон требует HTTPS или localhost для доступа к микрофону",
        );
        return;
      }
      if (!audioRef.current) {
        fail(requestId, "Аудиовыход телефона не готов");
        return;
      }

      await phoneRef.current?.dispose();
      const phone = new BrowserPhoneClient(config, audioRef.current, {
        onRegistered: () => {
          if (requestIdRef.current !== requestId) return;
          setState("registered");
          publish({
            type: "registered",
            requestId,
            extension: config.extension,
          });
        },
        onIncomingCall: () => {
          if (requestIdRef.current === requestId) setState("ringing");
        },
        onCallAnswered: () => {
          if (requestIdRef.current === requestId) setState("connected");
        },
        onCallEnded: () => {
          if (requestIdRef.current === requestId) setState("ended");
        },
        onDisconnected: (reason) => {
          if (requestIdRef.current !== requestId) return;
          setState("error");
          setError(formatBrowserPhoneError(reason));
        },
      });
      phoneRef.current = phone;

      try {
        await phone.connect();
      } catch (reason) {
        fail(requestId, formatBrowserPhoneError(reason));
      }
    };

    const onMessage = (event: MessageEvent<unknown>) => {
      const parsed = PhoneHostMessageSchema.safeParse(event.data);
      if (!parsed.success) return;
      if (parsed.data.type === "discover") {
        publish({ type: "ready", requestId: parsed.data.requestId });
        return;
      }
      if (parsed.data.type === "configure") {
        void configure(parsed.data.requestId, parsed.data.config);
        return;
      }
      if (parsed.data.requestId !== requestIdRef.current) return;
      if (parsed.data.type === "context") {
        const nextCrews = parsed.data.crews;
        setCrews(nextCrews);
        setCanCall(parsed.data.canCall);
        setNumber((current) =>
          nextCrews.some(({ phoneNumber }) => phoneNumber === current)
            ? current
            : "",
        );
        return;
      }
      if (parsed.data.type === "status") {
        setHostStatus({
          kind: parsed.data.kind,
          message: parsed.data.message,
        });
        if (parsed.data.kind === "error") {
          setState((current) =>
            current === "dialing" ? "registered" : current,
          );
        }
        return;
      }
      requestIdRef.current = undefined;
      setCrews([]);
      setCanCall(false);
      setHostStatus(undefined);
      setNumber("");
      setExtension(undefined);
      setState("waiting");
      void phoneRef.current?.dispose();
      phoneRef.current = null;
    };
    channel.addEventListener("message", onMessage);

    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
      channelRef.current = null;
      void phoneRef.current?.dispose();
      phoneRef.current = null;
    };
  }, []);

  const run = async (operation: "answer" | "decline" | "hangup") => {
    const phone = phoneRef.current;
    if (!phone) return;
    setError(undefined);
    try {
      if (operation === "answer") {
        setState("answering");
        await phone.answer();
      } else if (operation === "decline") {
        await phone.decline();
      } else {
        await phone.hangup();
      }
    } catch (reason) {
      setState("error");
      setError(
        reason instanceof Error
          ? reason.message
          : "Действие телефона не выполнено",
      );
    }
  };

  const offeredNumber = crews.some(({ phoneNumber }) => phoneNumber === number);
  const canDial =
    canCall &&
    offeredNumber &&
    extension !== undefined &&
    (state === "registered" || state === "ended");

  return (
    <main className="bg-gray-2 min-h-screen p-4">
      <audio ref={audioRef} autoPlay />
      <Card size="3" variant="classic" className="mx-auto grid max-w-md gap-5">
        <Flex align="center" justify="between" gap="3">
          <Flex align="center" gap="2">
            <PhoneCall size={22} />
            <Heading size="5">Телефон ДДС</Heading>
          </Flex>
          <Badge color={state === "error" ? "red" : "green"} variant="soft">
            {extension ? `АРМ ${extension}` : "Нет АРМ"}
          </Badge>
        </Flex>

        <div className="bg-gray-12 rounded-(--radius-3) p-5 text-white">
          <Text as="p" size="1" color="gray">
            Состояние
          </Text>
          <Text as="p" size="5" weight="bold" className="mt-1">
            {STATE_LABELS[state]}
          </Text>
        </div>

        {state === "waiting" && (
          <Text size="2" color="gray">
            Откройте карточку ДДС и нажмите «Открыть телефон»: рабочее место
            настроит этот аппарат само.
          </Text>
        )}

        {crews.length > 0 && (
          <div className="grid gap-1" aria-label="Наряды по карточке">
            <Text size="1" color="gray">
              Наряды по карточке
            </Text>
            {crews.map((crew) => (
              <Button
                key={crew.phoneNumber}
                size="2"
                variant={number === crew.phoneNumber ? "solid" : "soft"}
                onClick={() => {
                  setNumber(crew.phoneNumber);
                  setHostStatus(undefined);
                }}
              >
                {crew.callsign} · {crew.phoneNumber}
              </Button>
            ))}
          </div>
        )}

        {/* Клавиатура появляется вместе со справочником карточки: ждать
            регистрации в АТС незачем, она видна по состоянию выше. */}
        {(extension || crews.length > 0) && (
          <div className="grid gap-2" aria-label="Набор номера наряда">
            <div className="bg-gray-12 rounded-(--radius-2) px-4 py-3 text-white">
              <Text as="p" size="1" color="gray">
                Номер наряда
              </Text>
              <Text
                as="p"
                size="6"
                weight="bold"
                className="font-mono tabular-nums"
              >
                {number || "—"}
              </Text>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {DIAL_KEYS.map((key) => (
                <Button
                  key={key}
                  variant="soft"
                  color="gray"
                  size="3"
                  onClick={() =>
                    setNumber((current) => `${current}${key}`.slice(0, 12))
                  }
                >
                  {key}
                </Button>
              ))}
              <Button
                aria-label="Стереть цифру"
                variant="soft"
                color="gray"
                size="3"
                onClick={() => setNumber((current) => current.slice(0, -1))}
              >
                ←
              </Button>
            </div>

            <Button
              color="green"
              size="3"
              disabled={!canDial}
              onClick={() => {
                const requestId = requestIdRef.current;
                if (!requestId || !channelRef.current) return;
                setHostStatus(undefined);
                setState("dialing");
                // Звонок ставит рабочее место: только оно знает карточку.
                channelRef.current.postMessage({
                  type: "dial",
                  requestId,
                  number,
                } satisfies PhoneWindowMessage);
              }}
            >
              <PhoneCall size={18} /> Позвонить
            </Button>

            {number && !offeredNumber && (
              <Text size="1" color="amber">
                Для этой карточки можно вызвать только наряд из списка выше.
              </Text>
            )}

            {!canCall && (
              <Text size="1" color="gray">
                Сначала примите карточку в рабочем месте: до этого звонок наряду
                не засчитывается.
              </Text>
            )}
            {canCall && !extension && (
              <Text size="1" color="gray">
                Аппарат ещё не зарегистрирован в АТС: звонок станет доступен
                после подключения.
              </Text>
            )}
            {hostStatus && (
              <Callout.Root
                color={hostStatus.kind === "error" ? "red" : "green"}
                role={hostStatus.kind === "error" ? "alert" : undefined}
              >
                <Callout.Text>{hostStatus.message}</Callout.Text>
              </Callout.Root>
            )}
          </div>
        )}

        {state === "ringing" && (
          <Flex gap="2">
            <Button
              color="green"
              className="flex-1"
              onClick={() => void run("answer")}
            >
              <PhoneCall size={17} /> Ответить
            </Button>
            <Button
              color="red"
              variant="soft"
              onClick={() => void run("decline")}
            >
              <PhoneOff size={17} /> Отклонить
            </Button>
          </Flex>
        )}

        {state === "connected" && (
          <Button color="red" onClick={() => void run("hangup")}>
            <PhoneOff size={17} /> Завершить разговор
          </Button>
        )}

        {error && (
          <Callout.Root color="red" role="alert">
            <Callout.Icon>
              <AlertTriangle size={16} />
            </Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        <Text size="1" color="gray">
          Не закрывайте окно во время занятия. Микрофон включается только после
          нажатия «Ответить».
        </Text>
      </Card>
    </main>
  );
}
