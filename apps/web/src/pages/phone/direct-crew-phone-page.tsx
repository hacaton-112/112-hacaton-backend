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

import {
  DIRECT_CREW_PHONE_CHANNEL_NAME,
  DirectCrewPhoneHostMessageSchema,
  type DirectCrewPhoneEntry,
  type DirectCrewPhoneWindowMessage,
} from "../../lib/direct-crew-phone-window";
import { isBrowserMicrophonePermissionError } from "../../lib/browser-phone-window";
import { DirectCrewPhoneClient } from "../../services/direct-crew-phone.service";

type PhoneState =
  | "waiting"
  | "connecting"
  | "ready"
  | "dialing"
  | "connected"
  | "ended"
  | "error";

const STATE_LABELS: Record<PhoneState, string> = {
  waiting: "Ожидание карточки",
  connecting: "Подключение к backend",
  ready: "Готов к звонку",
  dialing: "Соединение с нарядом",
  connected: "Разговор",
  ended: "Звонок завершён",
  error: "Ошибка",
};

const DIAL_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

const describeError = (reason: unknown): string => {
  if (isBrowserMicrophonePermissionError(reason)) {
    return "Браузер не дал доступ к микрофону. Разрешите микрофон в настройках сайта и повторите звонок.";
  }
  return reason instanceof Error
    ? reason.message
    : "Не удалось начать разговор с нарядом";
};

export default function DirectCrewPhonePage() {
  const [state, setState] = useState<PhoneState>("waiting");
  const [error, setError] = useState<string>();
  const [number, setNumber] = useState("");
  const [exerciseId, setExerciseId] = useState<string>();
  const [crews, setCrews] = useState<readonly DirectCrewPhoneEntry[]>([]);
  const [canCall, setCanCall] = useState(false);
  const [crewLine, setCrewLine] = useState<string>();
  const [transcripts, setTranscripts] = useState<readonly string[]>([]);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const requestIdRef = useRef<string | undefined>(undefined);
  const phoneRef = useRef<DirectCrewPhoneClient | null>(null);

  useEffect(() => {
    const channel = new BroadcastChannel(DIRECT_CREW_PHONE_CHANNEL_NAME);
    channelRef.current = channel;
    const publish = (message: DirectCrewPhoneWindowMessage) =>
      channel.postMessage(message);
    const publishError = (requestId: string, message: string) => {
      setState("error");
      setError(message);
      publish({ type: "error", requestId, message });
      publish({ type: "call-state", requestId, state: "error", message });
    };

    const configure = async (requestId: string, accessToken: string) => {
      requestIdRef.current = requestId;
      setState("connecting");
      setError(undefined);
      await phoneRef.current?.dispose();

      const phone = new DirectCrewPhoneClient({
        onReady: () => {
          if (requestIdRef.current !== requestId) return;
          setState("ready");
          publish({ type: "connected", requestId });
        },
        onConnected: (event) => {
          if (requestIdRef.current !== requestId) return;
          setState("connected");
          setCrewLine(
            event.callsign
              ? `${event.callsign}, соединение установлено`
              : "Номер не найден",
          );
          publish({ type: "call-state", requestId, state: "connected" });
        },
        onTranscript: (event) => {
          if (requestIdRef.current !== requestId) return;
          setTranscripts((current) => [...current, event.text]);
        },
        onPrompt: (event) => {
          if (requestIdRef.current !== requestId) return;
          setCrewLine(event.text);
        },
        onEnded: (event) => {
          if (requestIdRef.current !== requestId) return;
          setState("ended");
          setCrewLine(
            event.outcome === "completed"
              ? "Наряд принял информацию"
              : event.outcome === "unknown_number"
                ? "Номер не обслуживается"
                : "Передача карточки не завершена",
          );
          publish({ type: "call-state", requestId, state: "ended" });
        },
        onError: (message) => {
          if (requestIdRef.current !== requestId) return;
          publishError(requestId, message);
        },
        onDisconnected: () => {
          if (requestIdRef.current !== requestId) return;
          publishError(requestId, "Соединение телефона с backend закрыто");
        },
      });
      phoneRef.current = phone;
      try {
        await phone.connect(accessToken);
      } catch (reason) {
        publishError(requestId, describeError(reason));
      }
    };

    const onMessage = (event: MessageEvent<unknown>) => {
      const parsed = DirectCrewPhoneHostMessageSchema.safeParse(event.data);
      if (!parsed.success) return;
      if (parsed.data.type === "discover") {
        publish({ type: "ready", requestId: parsed.data.requestId });
        return;
      }
      if (parsed.data.type === "configure") {
        void configure(parsed.data.requestId, parsed.data.accessToken);
        return;
      }
      if (parsed.data.requestId !== requestIdRef.current) return;
      if (parsed.data.type === "context") {
        const context = parsed.data;
        setExerciseId(context.exerciseId);
        setCrews(context.crews);
        setCanCall(context.canCall);
        setNumber((current) =>
          context.crews.some(({ phoneNumber }) => phoneNumber === current)
            ? current
            : "",
        );
        return;
      }

      requestIdRef.current = undefined;
      setExerciseId(undefined);
      setCrews([]);
      setCanCall(false);
      setNumber("");
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

  const offeredNumber = crews.some(
    ({ phoneNumber }) => phoneNumber === number,
  );
  const canDial =
    canCall &&
    Boolean(exerciseId) &&
    offeredNumber &&
    (state === "ready" || state === "ended");
  const callInProgress = state === "dialing" || state === "connected";

  const startCall = async () => {
    if (!exerciseId || !canDial || !phoneRef.current) return;
    setError(undefined);
    setCrewLine(undefined);
    setTranscripts([]);
    setState("dialing");
    try {
      await phoneRef.current.start(exerciseId, number);
    } catch (reason) {
      const message = describeError(reason);
      setState("error");
      setError(message);
      const requestId = requestIdRef.current;
      if (requestId) {
        channelRef.current?.postMessage({
          type: "call-state",
          requestId,
          state: "error",
          message,
        } satisfies DirectCrewPhoneWindowMessage);
      }
    }
  };

  return (
    <main className="bg-gray-2 min-h-screen p-4">
      <Card size="3" variant="classic" className="mx-auto grid max-w-md gap-5">
        <Flex align="center" justify="between" gap="3">
          <Flex align="center" gap="2">
            <PhoneCall size={22} />
            <Heading size="5">Телефон ДДС</Heading>
          </Flex>
          <Badge color={state === "error" ? "red" : "green"} variant="soft">
            Прямой канал
          </Badge>
        </Flex>

        <div className="bg-gray-12 rounded-(--radius-3) p-5 text-white">
          <Text as="p" size="1" color="gray">
            Состояние
          </Text>
          <Heading size="6">{STATE_LABELS[state]}</Heading>
          {crewLine && (
            <Text as="p" size="2" className="mt-2">
              {crewLine}
            </Text>
          )}
        </div>

        {crews.length > 0 && !callInProgress && (
          <div className="grid gap-1" aria-label="Наряды по карточке">
            <Text size="1" color="gray">
              Наряды по карточке
            </Text>
            {crews.map((crew) => (
              <Button
                key={crew.phoneNumber}
                size="2"
                variant={number === crew.phoneNumber ? "solid" : "soft"}
                onClick={() => setNumber(crew.phoneNumber)}
              >
                {crew.callsign} · {crew.phoneNumber}
              </Button>
            ))}
          </div>
        )}

        {crews.length > 0 && !callInProgress && (
          <div className="grid gap-2" aria-label="Набор номера наряда">
            <div className="bg-gray-12 rounded-(--radius-2) px-4 py-3 text-white">
              <Text as="p" size="1" color="gray">
                Номер наряда
              </Text>
              <Text as="p" size="6" weight="bold" className="font-mono">
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
            <Button color="green" size="3" disabled={!canDial} onClick={startCall}>
              <PhoneCall size={18} /> Позвонить
            </Button>
            {!canCall && (
              <Text size="1" color="gray">
                Сначала примите карточку в рабочем месте.
              </Text>
            )}
            {number && !offeredNumber && (
              <Text size="1" color="amber">
                Для этой карточки можно вызвать только наряд из списка.
              </Text>
            )}
          </div>
        )}

        {state === "connected" && (
          <Button
            color="red"
            size="3"
            onClick={() => void phoneRef.current?.end()}
          >
            <PhoneOff size={18} /> Завершить разговор
          </Button>
        )}

        {transcripts.length > 0 && (
          <div className="grid gap-1">
            <Text size="1" color="gray">
              Распознано
            </Text>
            {transcripts.map((text, index) => (
              <Text key={`${index}-${text}`} size="2">
                {text}
              </Text>
            ))}
          </div>
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
          Звук идёт напрямую через backend. SIP-телефон и регистрация в
          Asterisk не требуются.
        </Text>
      </Card>
    </main>
  );
}
