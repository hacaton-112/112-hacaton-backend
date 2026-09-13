import {
  Flex,
  Grid,
  IconButton,
  SegmentedControl,
  Slider,
  Table,
  Text,
} from "@bolid-ui/themes";
import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Debrief, DebriefRecordingSegment } from "../../contracts/debrief";
import {
  conversationOf,
  describeTimelineEntry,
  formatOffset,
  type TranscriptLine,
} from "./debrief-formatters";
import { DebriefScroll } from "./debrief-primitives";

/** Запись, загруженная в плеер: ссылка на байты и её ноль на шкале разговора. */
interface LoadedSource {
  readonly url: string;
  readonly objectUrl: string;
  readonly startMs: number;
}

/**
 * Разговор: плеер сверху, расшифровка под ним.
 *
 * Кнопок «прослушать» у строк нет — в макете их нет и они не нужны: строка
 * сама перематывает плеер на свой момент разговора.
 */
export function Transcript({
  debrief,
  loadRecordingSegment,
}: {
  debrief: Debrief;
  loadRecordingSegment: (url: string) => Promise<string>;
}) {
  // Разбор начинается с того, что было сказано; факты и ступени паники
  // читаются следом, поэтому разговор открыт по умолчанию.
  const [view, setView] = useState<"conversation" | "events">("conversation");
  const { attachAudio, ...player } = useRecordingPlayer(
    debrief,
    loadRecordingSegment,
  );
  const conversation = conversationOf(debrief.timeline);

  // Плеер и переключатель стоят на месте, прокручивается только история:
  // иначе, долистав до конца разговора, до шкалы уже не дотянуться.
  return (
    <Flex direction="column" className="min-h-0 flex-1">
      <Grid gap="4" px="5" pt="5" pb="3" className="shrink-0">
        <RecordingPlayer player={player} attachAudio={attachAudio} />

        <Flex justify="end">
          <SegmentedControl.Root
            size="1"
            value={view}
            onValueChange={(next) => setView(next as typeof view)}
          >
            <SegmentedControl.Item value="conversation">
              Разговор
            </SegmentedControl.Item>
            <SegmentedControl.Item value="events">
              Все события
            </SegmentedControl.Item>
          </SegmentedControl.Root>
        </Flex>
      </Grid>

      <DebriefScroll className="px-5 pb-5">
        {view === "conversation" && conversation.length === 0 && (
          <Text size="2" color="gray">
            Разговора не было: вызов завершился до первой реплики.
          </Text>
        )}

        <Table.Root size="1" variant="ghost" layout="fixed">
          <Table.Body>
            {view === "conversation"
              ? conversation.map((line) => (
                  <TranscriptRow
                    key={line.sequence}
                    line={line}
                    onOpen={() => void player.openAt(line.offsetMs)}
                    playable={player.canOpenAt(line.offsetMs)}
                  />
                ))
              : debrief.timeline.map((entry) => {
                  const { title, text } = describeTimelineEntry(entry);

                  return (
                    <TimelineRow
                      key={entry.sequence}
                      offsetMs={entry.offsetMs}
                      title={title}
                      titleMuted
                      text={text}
                      onOpen={() => void player.openAt(entry.offsetMs)}
                      playable={player.canOpenAt(entry.offsetMs)}
                    />
                  );
                })}
          </Table.Body>
        </Table.Root>
      </DebriefScroll>
    </Flex>
  );
}

/** Одна реплика расшифровки: кто, когда, что сказал. */
function TranscriptRow({
  line,
  onOpen,
  playable,
}: {
  line: TranscriptLine;
  onOpen: () => void;
  playable: boolean;
}) {
  const caller = line.speaker === "caller";

  return (
    <TimelineRow
      offsetMs={line.offsetMs}
      title={caller ? "Заявитель" : "Диспетчер"}
      titleMuted={!caller}
      text={line.text}
      note={line.note}
      onOpen={onOpen}
      playable={playable}
    />
  );
}

/** Строка таблицы разбора: время слева, содержимое справа. */
function TimelineRow({
  offsetMs,
  title,
  titleMuted = false,
  text,
  note,
  onOpen,
  playable,
}: {
  offsetMs: number | null;
  title: string;
  titleMuted?: boolean;
  text?: string;
  note?: string;
  onOpen: () => void;
  playable: boolean;
}) {
  return (
    <Table.Row
      align="start"
      className={playable ? "hover:bg-grayA-2 cursor-pointer" : undefined}
      onClick={playable ? onOpen : undefined}
      onKeyDown={
        playable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      role={playable ? "button" : undefined}
      tabIndex={playable ? 0 : undefined}
    >
      <Table.Cell width="80px" className="align-top">
        <Text size="1" weight="medium" color="gray" className="tabular-nums">
          {formatOffset(offsetMs)}
        </Text>
      </Table.Cell>
      <Table.Cell className="align-top">
        <Grid gap="1">
          <Flex align="center" gap="2">
            <Text
              size="1"
              weight="bold"
              color={titleMuted ? "gray" : undefined}
            >
              {title}
            </Text>
            {note !== undefined && (
              <Text size="1" color="gray">
                {note}
              </Text>
            )}
          </Flex>
          {text !== undefined && text !== "" && <Text size="2">{text}</Text>}
        </Grid>
      </Table.Cell>
    </Table.Row>
  );
}

/** Плеер записи: кнопка, шкала и два времени — как в макете. */
function RecordingPlayer({
  player,
  attachAudio,
}: {
  player: RecordingPlayerState;
  attachAudio: (element: HTMLAudioElement | null) => void;
}) {
  const total = player.durationMs ?? 0;

  return (
    <Flex align="center" gap="3">
      <IconButton
        aria-label={player.playing ? "Пауза" : "Слушать запись"}
        variant="ghost"
        size="3"
        disabled={!player.available || player.loading}
        onClick={() => void player.toggle()}
      >
        {player.playing ? <Pause size={24} /> : <Play size={24} />}
      </IconButton>
      <Text size="2" color="gray" className="tabular-nums">
        {formatOffset(player.positionMs)}
      </Text>
      <Slider
        aria-label="Позиция записи"
        size="2"
        disabled={!player.available || total === 0}
        max={Math.max(total, 1)}
        step={100}
        value={[Math.min(player.positionMs, total)]}
        onValueChange={([next]) => player.seekTo(next ?? 0)}
        className="flex-1"
      />
      <Text size="2" color="gray" className="tabular-nums">
        {player.loading ? "загружаю…" : formatOffset(total)}
      </Text>
      {/* Единственный настоящий источник звука: видимых контролов у него нет. */}
      <audio ref={attachAudio} className="hidden">
        <track kind="captions" />
      </audio>
    </Flex>
  );
}

interface RecordingPlayerState {
  readonly available: boolean;
  readonly loading: boolean;
  readonly playing: boolean;
  /** Позиция на шкале всего разговора, а не внутри загруженного куска. */
  readonly positionMs: number;
  readonly durationMs: number | null;
  readonly toggle: () => Promise<void>;
  readonly seekTo: (offsetMs: number) => void;
  readonly openAt: (offsetMs: number | null) => Promise<void>;
  readonly canOpenAt: (offsetMs: number | null) => boolean;
}

/**
 * То же плюс привязка тега `audio`: сам реф наружу не выходит и остаётся
 * деталью хука, поэтому вместо него отдаём callback-ref.
 */
interface RecordingPlayer extends RecordingPlayerState {
  readonly attachAudio: (element: HTMLAudioElement | null) => void;
}

/**
 * Плеер поверх двух источников: разговор целиком и отдельные куски.
 *
 * Когда запись есть целиком, шкала — это весь разговор, и строки расшифровки
 * просто перематывают её. Когда целиком записи нет, в плеер загружается кусок,
 * а его смещение держим отдельно, чтобы время на шкале оставалось временем
 * разговора, а не временем внутри куска.
 */
function useRecordingPlayer(
  debrief: Debrief,
  loadRecordingSegment: (url: string) => Promise<string>,
): RecordingPlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceRef = useRef<LoadedSource | null>(null);
  const [audioReady, setAudioReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [loadedDurationMs, setLoadedDurationMs] = useState<number | null>(null);

  const wholeCall = debrief.recordingUrl;
  const callDurationMs =
    debrief.timings.durationSeconds === null
      ? null
      : debrief.timings.durationSeconds * 1_000;

  const segmentFor = useCallback(
    (offsetMs: number | null): DebriefRecordingSegment | undefined =>
      offsetMs === null
        ? undefined
        : debrief.recording.find(
            (candidate) =>
              candidate.startMs <= offsetMs + 500 &&
              candidate.startMs + candidate.durationMs >= offsetMs,
          ),
    [debrief.recording],
  );

  // Ссылка на объект в памяти живёт до смены источника: иначе каждый
  // прослушанный кусок висит блобом до перезагрузки окна.
  useEffect(
    () => () => {
      if (sourceRef.current !== null) {
        URL.revokeObjectURL(sourceRef.current.objectUrl);
      }
    },
    [],
  );

  const attachAudio = useCallback((element: HTMLAudioElement | null) => {
    audioRef.current = element;
    setAudioReady(element !== null);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;

    if (audio === null) {
      return undefined;
    }

    const onTime = () =>
      setPositionMs(
        (sourceRef.current?.startMs ?? 0) + audio.currentTime * 1_000,
      );
    const onMeta = () =>
      setLoadedDurationMs(
        Number.isFinite(audio.duration) ? audio.duration * 1_000 : null,
      );
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onPause);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onPause);
    };
  }, [audioReady]);

  const load = useCallback(
    async (url: string, startMs: number) => {
      const audio = audioRef.current;

      if (audio === null || sourceRef.current?.url === url) {
        return;
      }

      setLoading(true);

      try {
        const objectUrl = await loadRecordingSegment(url);
        const previous = sourceRef.current;

        sourceRef.current = { url, objectUrl, startMs };
        audio.src = objectUrl;
        setLoadedDurationMs(null);
        setPositionMs(startMs);

        if (previous !== null) {
          URL.revokeObjectURL(previous.objectUrl);
        }
      } finally {
        setLoading(false);
      }
    },
    [loadRecordingSegment],
  );

  const seekTo = useCallback((offsetMs: number) => {
    const audio = audioRef.current;
    const source = sourceRef.current;

    setPositionMs(offsetMs);

    if (audio === null || source === null) {
      return;
    }

    audio.currentTime = Math.max(0, offsetMs - source.startMs) / 1_000;
  }, []);

  const toggle = useCallback(async () => {
    const audio = audioRef.current;

    if (audio === null) {
      return;
    }

    if (playing) {
      audio.pause();

      return;
    }

    if (sourceRef.current === null) {
      if (wholeCall === null) {
        return;
      }

      await load(wholeCall, 0);
    }

    await audio.play();
  }, [load, playing, wholeCall]);

  const canOpenAt = useCallback(
    (offsetMs: number | null) =>
      offsetMs !== null &&
      (wholeCall !== null || segmentFor(offsetMs) !== undefined),
    [segmentFor, wholeCall],
  );

  const openAt = useCallback(
    async (offsetMs: number | null) => {
      const audio = audioRef.current;

      if (audio === null || offsetMs === null) {
        return;
      }

      if (wholeCall === null) {
        const segment = segmentFor(offsetMs);

        if (segment === undefined) {
          return;
        }

        await load(segment.url, segment.startMs);
      } else {
        await load(wholeCall, 0);
        seekTo(offsetMs);
      }

      await audio.play();
    },
    [load, seekTo, segmentFor, wholeCall],
  );

  return {
    attachAudio,
    available: wholeCall !== null || debrief.recording.length > 0,
    loading,
    playing,
    positionMs,
    // Пока метаданные не прочитаны, шкалу держит длительность разговора:
    // иначе до первого нажатия справа стоял бы ноль.
    durationMs: loadedDurationMs ?? callDurationMs,
    toggle,
    seekTo,
    openAt,
    canOpenAt,
  };
}
