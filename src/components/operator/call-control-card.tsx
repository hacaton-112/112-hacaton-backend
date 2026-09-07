import {
  Badge,
  Button,
  Card,
  Flex,
  Heading,
  IconButton,
  Text,
  Tooltip,
} from "@bolid-ui/themes";
import {
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneIncoming,
  PhoneOff,
  Play,
  RotateCcw,
} from "lucide-react";

import type {
  CallControls,
  CallSnapshot,
  CallState,
} from "../../hooks/use-call";
import { VoiceVisualizerPanel } from "./voice-visualizer-panel";

type CallControlCardProps = CallSnapshot & CallControls;

const STATE_LABELS: Record<CallState, string> = {
  idle: "Свободен",
  ringing: "Входящий вызов",
  active: "Разговор",
  ended: "Вызов завершён",
};

const STATE_COLORS: Record<CallState, "gray" | "amber" | "green"> = {
  idle: "gray",
  ringing: "amber",
  active: "green",
  ended: "gray",
};

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

export function CallControlCard({
  state,
  callerNumber,
  isOnHold,
  isMuted,
  elapsedSeconds,
  simulateIncoming,
  accept,
  reject,
  end,
  toggleHold,
  toggleMute,
  reset,
}: CallControlCardProps) {
  return (
    <Card size="2" className="w-70 shrink-0">
      <Flex direction="column" gap="3" className="h-full">
        <Flex align="center" justify="between" gap="2">
          <Heading size="3">Вызов</Heading>
          <Badge
            color={isOnHold ? "amber" : STATE_COLORS[state]}
            variant="soft"
          >
            {isOnHold ? "На удержании" : STATE_LABELS[state]}
          </Badge>
        </Flex>

        <Flex direction="column" gap="1">
          <Text size="5" weight="medium" className="tabular-nums">
            {callerNumber ?? "—"}
          </Text>
          <Text size="2" color="gray" className="tabular-nums">
            {state === "active" ? formatDuration(elapsedSeconds) : "00:00"}
          </Text>
        </Flex>

        <VoiceVisualizerPanel
          isListening={state === "active" && !isMuted && !isOnHold}
        />

        <Flex direction="column" gap="2" className="mt-auto">
          {state === "ringing" && (
            <Flex gap="2">
              <Button
                size="2"
                color="green"
                onClick={accept}
                className="flex-1"
              >
                <Phone size={16} aria-hidden />
                Принять
              </Button>
              <Button
                size="2"
                color="red"
                variant="soft"
                onClick={reject}
                className="flex-1"
              >
                <PhoneOff size={16} aria-hidden />
                Отклонить
              </Button>
            </Flex>
          )}

          {state === "active" && (
            <Flex gap="2" align="center">
              <Button size="2" color="red" onClick={end} className="flex-1">
                <PhoneOff size={16} aria-hidden />
                Завершить
              </Button>
              <Tooltip
                content={
                  isOnHold ? "Снять с удержания" : "Поставить на удержание"
                }
              >
                <IconButton
                  size="2"
                  variant={isOnHold ? "solid" : "soft"}
                  color="gray"
                  onClick={toggleHold}
                  aria-label={
                    isOnHold ? "Снять с удержания" : "Поставить на удержание"
                  }
                >
                  {isOnHold ? (
                    <Play size={16} aria-hidden />
                  ) : (
                    <Pause size={16} aria-hidden />
                  )}
                </IconButton>
              </Tooltip>
              <Tooltip
                content={isMuted ? "Включить микрофон" : "Выключить микрофон"}
              >
                <IconButton
                  size="2"
                  variant={isMuted ? "solid" : "soft"}
                  color={isMuted ? "red" : "gray"}
                  onClick={toggleMute}
                  aria-label={
                    isMuted ? "Включить микрофон" : "Выключить микрофон"
                  }
                >
                  {isMuted ? (
                    <MicOff size={16} aria-hidden />
                  ) : (
                    <Mic size={16} aria-hidden />
                  )}
                </IconButton>
              </Tooltip>
            </Flex>
          )}

          {state === "idle" && (
            <Button size="2" variant="soft" onClick={simulateIncoming}>
              <PhoneIncoming size={16} aria-hidden />
              Смоделировать вызов
            </Button>
          )}

          {state === "ended" && (
            <Button size="2" variant="soft" color="gray" onClick={reset}>
              <RotateCcw size={16} aria-hidden />К следующему вызову
            </Button>
          )}
        </Flex>
      </Flex>
    </Card>
  );
}
