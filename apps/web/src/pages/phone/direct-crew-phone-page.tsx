import {
  Badge,
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Select,
  Text,
} from "@bolid-ui/themes";
import {
  AlertTriangle,
  AudioLines,
  PhoneCall,
  PhoneOff,
  RefreshCw,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  DIRECT_CREW_PHONE_CHANNEL_NAME,
  DirectCrewPhoneHostMessageSchema,
  type DirectCrewPhoneEntry,
  type DirectCrewPhoneWindowMessage,
} from "../../lib/direct-crew-phone-window";
import { isBrowserMicrophonePermissionError } from "../../lib/browser-phone-window";
import {
  enumerateAudioDevices,
  playTelephoneTestTone,
  supportsOutputDeviceSelection,
  type AudioDeviceInfo,
} from "../../lib/web-audio";
import { DirectCrewPhoneClient } from "../../services/direct-crew-phone.service";
import { settingsService, useSettings } from "../../services/settings.service";

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
  connecting: "Подключение телефона",
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
  const settings = useSettings();
  const [state, setState] = useState<PhoneState>("waiting");
  const [error, setError] = useState<string>();
  const [number, setNumber] = useState("");
  const [exerciseId, setExerciseId] = useState<string>();
  const [crews, setCrews] = useState<readonly DirectCrewPhoneEntry[]>([]);
  const [canCall, setCanCall] = useState(false);
  const [crewLine, setCrewLine] = useState<string>();
  const [transcripts, setTranscripts] = useState<readonly string[]>([]);
  const [playbackLevel, setPlaybackLevel] = useState(0);
  const [testingOutput, setTestingOutput] = useState(false);
  const [outputDevices, setOutputDevices] = useState<
    readonly AudioDeviceInfo[]
  >([]);
  const [loadingOutputs, setLoadingOutputs] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const requestIdRef = useRef<string | undefined>(undefined);
  const phoneRef = useRef<DirectCrewPhoneClient | null>(null);

  const refreshOutputDevices = useCallback(async (requestAccess: boolean) => {
    if (!supportsOutputDeviceSelection) return;
    setLoadingOutputs(true);
    try {
      const { outputs } = await enumerateAudioDevices(requestAccess);
      setOutputDevices(outputs);
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setLoadingOutputs(false);
    }
  }, []);

  useEffect(() => {
    if (!supportsOutputDeviceSelection) return;
    const refresh = () => void refreshOutputDevices(false);
    refresh();
    navigator.mediaDevices?.addEventListener("devicechange", refresh);
    return () =>
      navigator.mediaDevices?.removeEventListener("devicechange", refresh);
  }, [refreshOutputDevices]);

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
        onPlaybackLevel: (level) => {
          if (requestIdRef.current !== requestId) return;
          setPlaybackLevel((current) =>
            level >= current ? level : current * 0.75,
          );
        },
        onEnded: (event) => {
          if (requestIdRef.current !== requestId) return;
          setState("ended");
          setPlaybackLevel(0);
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
          publishError(requestId, "Соединение телефона прервано");
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
      setPlaybackLevel(0);
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

  const offeredNumber = crews.some(({ phoneNumber }) => phoneNumber === number);
  const selectableOutputDevices = outputDevices.filter(
    ({ id }) => id.length > 0,
  );
  const canDial =
    canCall &&
    Boolean(exerciseId) &&
    offeredNumber &&
    settings.outputVolume > 0 &&
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

  const testOutput = async () => {
    if (callInProgress || testingOutput || settings.outputVolume <= 0) return;
    setTestingOutput(true);
    setError(undefined);
    setPlaybackLevel(0);
    try {
      await playTelephoneTestTone({
        outputDevice: settings.outputDevice,
        outputDeviceLabel: settings.outputDeviceLabel,
        outputVolume: settings.outputVolume,
        onLevel: setPlaybackLevel,
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Не удалось проверить динамик",
      );
    } finally {
      setTestingOutput(false);
      setPlaybackLevel(0);
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

        <div className="border-gray-6 grid gap-3 border p-3">
          <Flex align="center" justify="between" gap="3">
            <Flex align="center" gap="2" minWidth="0">
              {settings.outputVolume > 0 ? (
                <Volume2 size={18} className="shrink-0" />
              ) : (
                <VolumeX size={18} className="shrink-0" />
              )}
              <div className="min-w-0">
                <Text as="p" size="1" color="gray">
                  Аудиовыход
                </Text>
                <Text as="p" size="2" weight="medium" className="truncate">
                  {settings.outputDeviceLabel || "Системное устройство"} ·{" "}
                  {Math.round(settings.outputVolume * 100)}%
                </Text>
              </div>
            </Flex>
            {settings.outputDevice && (
              <Button
                aria-label="Вернуть системный аудиовыход"
                color="gray"
                size="1"
                variant="soft"
                disabled={callInProgress}
                onClick={() =>
                  settingsService.update({
                    outputDevice: null,
                    outputDeviceLabel: null,
                  })
                }
              >
                <RotateCcw size={14} /> Системный
              </Button>
            )}
          </Flex>

          {supportsOutputDeviceSelection &&
            selectableOutputDevices.length > 0 && (
              <Select.Root
                value={settings.outputDevice ?? "system"}
                disabled={callInProgress}
                onValueChange={(deviceId) => {
                  const device = selectableOutputDevices.find(
                    ({ id }) => id === deviceId,
                  );
                  settingsService.update({
                    outputDevice: device?.id ?? null,
                    outputDeviceLabel: device?.label || null,
                  });
                }}
              >
                <Select.Trigger
                  aria-label="Аудиовыход телефона"
                  className="w-full"
                  placeholder="Системное устройство"
                />
                <Select.Content position="popper">
                  <Select.Item value="system">Системное устройство</Select.Item>
                  {selectableOutputDevices.map((device) => (
                    <Select.Item key={device.id} value={device.id}>
                      {device.name}
                      {device.isDefault ? " (по умолчанию)" : ""}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            )}

          {supportsOutputDeviceSelection && !callInProgress && (
            <Button
              color="gray"
              size="1"
              variant="ghost"
              disabled={loadingOutputs}
              onClick={() => void refreshOutputDevices(true)}
            >
              <RefreshCw
                className={loadingOutputs ? "animate-spin" : undefined}
                size={14}
              />
              {loadingOutputs
                ? "Ищем аудиоустройства…"
                : "Обновить список наушников"}
            </Button>
          )}

          <div
            aria-label="Уровень ответа наряда"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={Math.round(playbackLevel * 100)}
            className="bg-gray-4 h-2 overflow-hidden"
            role="meter"
          >
            <div
              className="bg-green-9 h-full transition-[width] duration-75"
              style={{
                width: `${Math.max(0, Math.min(100, playbackLevel * 100))}%`,
              }}
            />
          </div>
          <Text size="1" color="gray">
            {playbackLevel > 0.01
              ? "Ответ наряда поступает в динамик"
              : testingOutput
                ? "Воспроизводим проверочный сигнал"
                : "Перед звонком убедитесь, что слышите проверочный сигнал"}
          </Text>

          {settings.outputVolume <= 0 ? (
            <Callout.Root color="amber" size="1">
              <Callout.Icon>
                <VolumeX size={16} />
              </Callout.Icon>
              <Callout.Text>
                Звук телефона выключен. Звонок не начнётся, пока динамик
                отключён.
              </Callout.Text>
              <Button
                color="amber"
                size="1"
                variant="soft"
                onClick={() => settingsService.update({ outputVolume: 1 })}
              >
                Включить звук
              </Button>
            </Callout.Root>
          ) : (
            <Button
              color="gray"
              size="2"
              variant="soft"
              disabled={callInProgress || testingOutput}
              onClick={() => void testOutput()}
            >
              <AudioLines size={16} />
              {testingOutput ? "Проверяем динамик…" : "Проверить звук"}
            </Button>
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
            <Button
              color="green"
              size="3"
              disabled={!canDial}
              onClick={startCall}
            >
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
          Перед звонком разрешите доступ к микрофону и проверьте звук в
          выбранных наушниках.
        </Text>
      </Card>
    </main>
  );
}
