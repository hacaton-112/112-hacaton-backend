import { Button, Card, Flex, Text } from "@bolid-ui/themes";
import { Play } from "lucide-react";
import { useState } from "react";

import type { Debrief } from "../../contracts/debrief";
import {
  conversationOf,
  describeTimelineEntry,
  formatOffset,
  type TranscriptLine,
} from "./debrief-formatters";

/** Разговор и запись: чат, который был, и звонок целиком. */
export function Transcript({
  debrief,
  loadRecordingSegment,
}: {
  debrief: Debrief;
  loadRecordingSegment: (url: string) => Promise<string>;
}) {
  const [playing, setPlaying] = useState<string>();
  const [loadingWholeCall, setLoadingWholeCall] = useState(false);
  // Разбор начинается с того, что было сказано; факты и ступени паники
  // читаются следом, поэтому разговор открыт по умолчанию.
  const [view, setView] = useState<"conversation" | "events">("conversation");

  /** Запись целиком весит мегабайты, поэтому кнопка ждёт вместе с загрузкой. */
  const play = async (url: string, wholeCall = false) => {
    setLoadingWholeCall(wholeCall);

    try {
      setPlaying(await loadRecordingSegment(url));
    } finally {
      setLoadingWholeCall(false);
    }
  };

  const segmentFor = (offsetMs: number | null) =>
    debrief.recording.find(
      (candidate) =>
        offsetMs !== null &&
        candidate.startMs <= offsetMs + 500 &&
        candidate.startMs + candidate.durationMs >= offsetMs,
    );

  const conversation = conversationOf(debrief.timeline);
  const wholeCall = debrief.recordingUrl;

  return (
    <Card size="2" variant="classic" className="lg:row-span-2">
      <Flex align="center" justify="between" gap="2">
        <Flex gap="1">
          <Button
            size="1"
            variant={view === "conversation" ? "soft" : "ghost"}
            onClick={() => setView("conversation")}
          >
            Разговор
          </Button>
          <Button
            size="1"
            variant={view === "events" ? "soft" : "ghost"}
            onClick={() => setView("events")}
          >
            Все события
          </Button>
        </Flex>
        {wholeCall !== null && (
          <Button
            size="1"
            variant="soft"
            disabled={loadingWholeCall}
            onClick={() => void play(wholeCall, true)}
          >
            <Play size={13} />
            {loadingWholeCall ? "Загружаю запись…" : "Разговор целиком"}
          </Button>
        )}
      </Flex>

      {view === "conversation" && (
        <div className="mt-3 grid gap-3">
          {conversation.length === 0 && (
            <Text size="2" color="gray">
              Разговора не было: вызов завершился до первой реплики.
            </Text>
          )}
          {conversation.map((line) => (
            <TranscriptRow
              key={line.sequence}
              line={line}
              onPlay={() => {
                const segment = segmentFor(line.offsetMs);

                if (segment) {
                  void play(segment.url);
                }
              }}
              playable={segmentFor(line.offsetMs) !== undefined}
            />
          ))}
        </div>
      )}

      {view === "events" && (
        <div className="mt-3 grid gap-2">
          {debrief.timeline.map((entry) => {
            const { title, text } = describeTimelineEntry(entry);
            const segment = debrief.recording.find(
              (candidate) =>
                entry.offsetMs !== null &&
                candidate.startMs <= entry.offsetMs + 500 &&
                candidate.startMs + candidate.durationMs >= entry.offsetMs,
            );

            return (
              <Flex key={entry.sequence} align="start" gap="2">
                <Text
                  size="1"
                  color="gray"
                  className="w-12 shrink-0 tabular-nums"
                >
                  {formatOffset(entry.offsetMs)}
                </Text>
                <div className="min-w-0 flex-1">
                  <Text size="1" color="gray">
                    {title}
                  </Text>
                  {text && (
                    <Text size="2" as="p">
                      {text}
                    </Text>
                  )}
                </div>
                {segment && (
                  <Button
                    size="1"
                    variant="ghost"
                    onClick={() => void play(segment.url)}
                    aria-label="Прослушать"
                  >
                    <Play size={13} />
                  </Button>
                )}
              </Flex>
            );
          })}
        </div>
      )}

      {playing && (
        <audio className="mt-3 w-full" controls autoPlay src={playing}>
          <track kind="captions" />
        </audio>
      )}
    </Card>
  );
}

/** Одна реплика расшифровки: кто, когда, что сказал. */
function TranscriptRow({
  line,
  onPlay,
  playable,
}: {
  line: TranscriptLine;
  onPlay: () => void;
  playable: boolean;
}) {
  const caller = line.speaker === "caller";

  return (
    <Flex align="start" gap="2">
      <Text size="1" color="gray" className="w-12 shrink-0 tabular-nums">
        {formatOffset(line.offsetMs)}
      </Text>
      <div className="min-w-0 flex-1">
        <Flex align="center" gap="2">
          <Text size="1" weight="bold" color={caller ? "orange" : "blue"}>
            {caller ? "Заявитель" : "Оператор"}
          </Text>
          {line.note && (
            <Text size="1" color="gray">
              {line.note}
            </Text>
          )}
        </Flex>
        <Text size="2" as="p">
          {line.text}
        </Text>
      </div>
      {playable && (
        <Button
          size="1"
          variant="ghost"
          onClick={onPlay}
          aria-label="Прослушать"
        >
          <Play size={13} />
        </Button>
      )}
    </Flex>
  );
}
