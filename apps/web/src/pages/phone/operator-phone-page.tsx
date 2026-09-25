import { Button, ScrollArea, Text } from "@bolid-ui/themes";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  createPhoneWindowChannel,
  type PhoneCallSnapshot,
} from "../../lib/operator-phone-window";

const STATE_LABELS: Record<PhoneCallSnapshot["state"], string> = {
  idle: "Вызова нет",
  ringing: "Входящий вызов",
  active: "Разговор",
  ended: "Вызов завершён",
};

const formatDuration = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * Телефон оператора 112 в отдельном окне.
 *
 * В классе рабочее место занимает весь экран, а разговор всё равно нужно
 * видеть: кто звонит, сколько идёт вызов и что уже сказано. Окно ничего не
 * решает само — оно показывает снимок звонка и отправляет обратно нажатия.
 */
export default function OperatorPhonePage() {
  const [snapshot, setSnapshot] = useState<PhoneCallSnapshot | null>(null);
  const channel = useRef<ReturnType<typeof createPhoneWindowChannel>>(null);

  useEffect(() => {
    const opened = createPhoneWindowChannel(setSnapshot);
    channel.current = opened;

    return () => {
      channel.current = null;
      opened.dispose();
    };
  }, []);

  const live = snapshot?.state === "active";

  return (
    <div className="arm112-phone-window">
      <header>
        <span className="arm112-phone-window-label">Телефон 112</span>
        <strong>{snapshot?.callerNumber ?? "+7 (   )   -   -"}</strong>
        <span className="arm112-phone-window-state" data-live={live || undefined}>
          {snapshot ? STATE_LABELS[snapshot.state] : "Нет связи с рабочим местом"}
        </span>
      </header>

      <div className="arm112-phone-window-timer">
        <strong>{formatDuration(snapshot?.elapsedSeconds ?? 0)}</strong>
        <span>
          {snapshot?.scenarioTitle ?? "Сценарий не выбран"}
          {snapshot?.isCallerSpeaking ? " · заявитель говорит" : ""}
        </span>
      </div>

      <Dialogue turns={snapshot?.dialogue ?? []} />

      <footer>
        <Button
          type="button"
          size="3"
          variant={snapshot?.isMuted ? "solid" : "soft"}
          color={snapshot?.isMuted ? "red" : "gray"}
          disabled={!live}
          onClick={() => channel.current?.send("toggle-mute")}
        >
          {snapshot?.isMuted ? <MicOff size={18} /> : <Mic size={18} />}
          {snapshot?.isMuted ? "Микрофон выключен" : "Микрофон"}
        </Button>
        <Button
          type="button"
          size="3"
          color="red"
          disabled={!live}
          onClick={() => channel.current?.send("end")}
        >
          <PhoneOff size={18} /> Завершить
        </Button>
      </footer>
    </div>
  );
}

function Dialogue({ turns }: { turns: PhoneCallSnapshot["dialogue"] }) {
  const viewport = useRef<HTMLDivElement>(null);
  const lastTurnId = turns.at(-1)?.id;

  useLayoutEffect(() => {
    if (!lastTurnId) return;

    const element = viewport.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lastTurnId]);

  return (
    <section className="arm112-phone-window-chat" aria-label="Чат с заявителем">
      <span className="arm112-block-label">Чат с заявителем</span>
      {turns.length === 0 ? (
        <Text size="1" color="gray">
          Сообщений с заявителем пока нет
        </Text>
      ) : (
        <ScrollArea
          type="auto"
          scrollbars="vertical"
          className="h-full min-w-0"
          ref={viewport}
        >
          <div className="grid w-full min-w-0 gap-2 pr-3" aria-live="polite">
            {turns.map((turn) => (
              <div
                key={turn.id}
                className={
                  turn.role === "operator"
                    ? "arm-dialogue-operator min-w-0 px-3 py-2"
                    : "arm-dialogue-caller min-w-0 px-3 py-2"
                }
              >
                <Text size="1" color="gray">
                  {turn.role === "operator" ? "Оператор" : "Заявитель"}
                </Text>
                <Text
                  size="2"
                  as="p"
                  className="min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap"
                >
                  {turn.text}
                </Text>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </section>
  );
}
