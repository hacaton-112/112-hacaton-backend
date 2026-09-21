import { Button, IconButton, Spinner, Text } from "@bolid-ui/themes";
import {
  ClipboardList,
  Mic,
  MicOff,
  PhoneOff,
  RotateCcw,
  Send,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import type { CallControls, CallSnapshot } from "../../hooks/use-call";
import { OperatorTour } from "./operator-tour";
import { ScenarioPicker } from "./scenario-picker";
import { VoiceVisualizerPanel } from "./voice-visualizer-panel";
import { ROUTES } from "../../config/routes";

type CallControlDockProps = Omit<CallSnapshot & CallControls, "end"> & {
  missingCardFields: readonly string[];
  isCardSubmitted: boolean;
  isDispatching: boolean;
  isEnding: boolean;
  onDispatch: () => void;
  onEnd: () => void;
};

const formatDuration = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

export function CallControlDock(props: CallControlDockProps) {
  const navigate = useNavigate();
  const isCallRunning = props.state === "active";
  // Отдельная переменная, чтобы сузить тип: внутри обработчика TypeScript уже
  // не помнит проверку `props.trainingSessionId`.
  const debriefSessionId = props.trainingSessionId;
  const dispatchHint =
    props.missingCardFields.length === 0
      ? "Отправить заполненную карточку в ДДС"
      : `Нужно заполнить: ${props.missingCardFields.join(", ")}`;

  return (
    <div
      className="arm-operator-dock absolute inset-x-0 bottom-0 z-50"
      data-tour="call-controls"
      aria-label="Управление звонком"
    >
      <div className="grid grid-cols-[7rem_minmax(10rem,1fr)_auto] items-center gap-3 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="arm-dock-label">Вызов</span>
          <Text size="3" weight="bold" className="text-white! tabular-nums">
            {formatDuration(props.elapsedSeconds)}
          </Text>
        </div>

        <AudioMonitor>
          <div className="relative h-full">
            {isCallRunning && (
              <div className="absolute inset-0">
                <VoiceVisualizerPanel
                  isListening={isCallRunning && !props.isMuted}
                />
              </div>
            )}
            {props.isCallerSpeaking && (
              <div className="absolute inset-0 z-10">
                <TtsLevelWave
                  level={props.callerAudioLevel}
                  active={props.isCallerSpeaking}
                />
              </div>
            )}
          </div>
        </AudioMonitor>

        <div className="flex min-w-fit items-center justify-end gap-2">
          <OperatorTour />

          {props.state === "idle" && (
            <ScenarioPicker
              disabled={!props.isConnected}
              onStart={props.startScenario}
            />
          )}

          {props.state === "active" && (
            <>
              <Button
                type="button"
                size="2"
                variant="soft"
                onClick={props.onDispatch}
                disabled={
                  props.isCardSubmitted ||
                  props.isDispatching ||
                  props.isRecovering
                }
                title={dispatchHint}
                aria-label={dispatchHint}
              >
                {props.isDispatching ? (
                  <Spinner size="1" />
                ) : (
                  <Send size={16} />
                )}
                {props.isCardSubmitted ? "Отправлена" : "Отправить карточку"}
              </Button>
              <IconButton
                size="2"
                variant={props.isMuted ? "solid" : "soft"}
                color={props.isMuted ? "red" : "gray"}
                onClick={props.toggleMute}
                disabled={props.isRecovering}
                aria-label={
                  props.isMuted ? "Включить микрофон" : "Выключить микрофон"
                }
              >
                {props.isMuted ? <MicOff size={17} /> : <Mic size={17} />}
              </IconButton>
              <Button
                type="button"
                size="2"
                color="red"
                onClick={props.onEnd}
                disabled={
                  props.isEnding || props.isDispatching || props.isRecovering
                }
                aria-label="Завершить вызов"
              >
                {props.isEnding ? <Spinner size="1" /> : <PhoneOff size={17} />}
                Завершить
              </Button>
            </>
          )}

          {props.state === "ended" && (
            <>
              {debriefSessionId !== undefined && (
                <Button
                  size="2"
                  variant="soft"
                  onClick={() =>
                    navigate(ROUTES.debriefSession(debriefSessionId))
                  }
                >
                  <ClipboardList size={17} /> Разбор
                </Button>
              )}
              <Button
                size="2"
                variant="soft"
                color="gray"
                onClick={props.reset}
              >
                <RotateCcw size={17} /> Сбросить
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AudioMonitor({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-8 min-w-0 items-center justify-center overflow-hidden">
      <div className="h-6 w-full">{children}</div>
    </div>
  );
}

const TTS_BAR_COUNT = 96;

/** Волна реального уровня TTS, рассчитанного после телефонного DSP в Rust. */
function TtsLevelWave({ level, active }: { level: number; active: boolean }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!active) return;

    const timer = window.setInterval(() => {
      setPhase((current) => current + 1);
    }, 45);

    return () => window.clearInterval(timer);
  }, [active]);

  // Заполняем сразу всю ширину: короткая TTS-реплика не должна закончиться
  // раньше, чем накопится история полос. RMS из Rust задаёт общую амплитуду,
  // а минимальный уровень показывает сам факт активного воспроизведения.
  const strength = active ? Math.min(1, Math.max(0.22, level * 2.6)) : 0;
  const bars = Array.from({ length: TTS_BAR_COUNT }, (_, index) => {
    const carrier = Math.abs(
      Math.sin((index + phase * 1.8) * 0.47) * 0.65 +
        Math.sin((index - phase) * 0.19) * 0.35,
    );
    return strength * (0.22 + carrier * 0.78);
  });

  return (
    <div className="flex h-6 items-center justify-center gap-px" aria-hidden>
      {bars.map((bar, index) => (
        <span
          key={index}
          className="bg-blue-9 block min-w-px flex-1 rounded-full transition-[height,opacity] duration-75"
          style={{
            height: `${Math.max(2, bar * 22)}px`,
            opacity: active && bar > 0 ? 1 : 0,
          }}
        />
      ))}
    </div>
  );
}
