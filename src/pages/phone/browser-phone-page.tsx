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
  PHONE_CHANNEL_NAME,
  PhoneHostMessageSchema,
  type PhoneWindowMessage,
} from "../../lib/browser-phone-window";
import { BrowserPhoneClient } from "../../services/browser-phone.service";

type PhoneState =
  | "waiting"
  | "connecting"
  | "registered"
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
  const channelRef = useRef<BroadcastChannel | null>(null);
  const requestIdRef = useRef<string>();

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
          setState("registered");
          publish({
            type: "registered",
            requestId,
            extension: config.extension,
          });
        },
        onIncomingCall: () => setState("ringing"),
        onCallAnswered: () => setState("connected"),
        onCallEnded: () => setState("ended"),
        onDisconnected: (reason) => {
          setState("error");
          setError(reason?.message ?? "Соединение с Asterisk потеряно");
        },
      });
      phoneRef.current = phone;

      try {
        await phone.connect();
      } catch (reason) {
        fail(
          requestId,
          reason instanceof Error
            ? reason.message
            : "Не удалось зарегистрировать телефон в Asterisk",
        );
      }
    };

    const onMessage = (event: MessageEvent<unknown>) => {
      const parsed = PhoneHostMessageSchema.safeParse(event.data);
      if (!parsed.success) return;
      if (parsed.data.type === "discover") {
        publish({ type: "ready", requestId: parsed.data.requestId });
        return;
      }
      void configure(parsed.data.requestId, parsed.data.config);
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

        {extension && (
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
              disabled={number === "" || state === "connecting"}
              onClick={() => {
                const requestId = requestIdRef.current;
                if (!requestId || !channelRef.current) return;
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
