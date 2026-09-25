import { Badge, Button, Flex, Text, TextArea } from "@bolid-ui/themes";
import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { CallState } from "../../contracts/call";

export interface DialogueTurn {
  id: string;
  role: "operator" | "caller";
  text: string;
}

interface TextConversationPanelProps {
  state: CallState;
  dialogue: DialogueTurn[];
  /** Заявитель ещё пишет ответ: второй вопрос подряд задавать рано. */
  isCallerSpeaking: boolean;
  disabled: boolean;
  onSay: (text: string) => void;
}

const MAX_LENGTH = 1_000;

/**
 * Разговор словами вместо голоса.
 *
 * В голосовом режиме ленту разговора заменяет сам звук, и на экране её нет. В
 * текстовом показывать её обязательно: иначе оператор не видит ни своего
 * вопроса, ни ответа заявителя. Факты, паника и оценка при этом те же —
 * отличается только способ реплики.
 */
export function TextConversationPanel({
  state,
  dialogue,
  isCallerSpeaking,
  disabled,
  onSay,
}: TextConversationPanelProps) {
  const [draft, setDraft] = useState("");
  const feedRef = useRef<HTMLDivElement>(null);

  // Лента держится на последней реплике: разговор читают снизу вверх.
  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [dialogue, isCallerSpeaking]);

  const send = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    onSay(text);
    setDraft("");
  };

  return (
    <section
      className="border-gray-6 bg-panel-solid pointer-events-auto flex h-96 w-96 max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-(--radius-4) border p-3 shadow-lg"
      aria-label="Текстовый разговор с заявителем"
    >
      <Flex align="center" justify="between" gap="2">
        <Text size="2" weight="bold">
          Разговор текстом
        </Text>
        <Badge color={state === "ended" ? "gray" : "green"} variant="soft">
          {state === "ended" ? "Завершён" : "Идёт"}
        </Badge>
      </Flex>

      <div
        ref={feedRef}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1"
        role="log"
        aria-live="polite"
      >
        {dialogue.length === 0 && (
          <Text size="2" color="gray">
            Заявитель на линии. Начните разговор.
          </Text>
        )}
        {dialogue.map((turn) => (
          <div
            key={turn.id}
            className={
              turn.role === "operator"
                ? "bg-accent-3 self-end rounded-(--radius-3) px-3 py-2"
                : "bg-gray-3 self-start rounded-(--radius-3) px-3 py-2"
            }
            style={{ maxWidth: "85%" }}
          >
            <Text as="p" size="1" color="gray">
              {turn.role === "operator" ? "Вы" : "Заявитель"}
            </Text>
            <Text as="p" size="2">
              {turn.text}
            </Text>
          </div>
        ))}
        {isCallerSpeaking && (
          <Text size="1" color="gray" className="self-start">
            Заявитель отвечает…
          </Text>
        )}
      </div>

      <TextArea
        rows={2}
        maxLength={MAX_LENGTH}
        value={draft}
        disabled={disabled}
        placeholder="Ваш вопрос заявителю"
        onChange={(event) => setDraft(event.target.value)}
        // Enter отправляет, перенос строки — Shift+Enter: в разговоре реплики
        // короткие, и тянуться к кнопке после каждой мешает.
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        }}
      />
      <Button
        type="button"
        disabled={disabled || draft.trim().length === 0}
        onClick={send}
      >
        <Send size={16} /> Отправить реплику
      </Button>
    </section>
  );
}
