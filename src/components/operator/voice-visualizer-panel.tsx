import { Flex, Text } from "@bolid-ui/themes";
import { MicOff } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { VoiceVisualizer, useVoiceVisualizer } from "react-voice-visualizer";

const VISUALIZER_HEIGHT = 56;

interface VoiceVisualizerPanelProps {
  /** Запись идёт только во время разговора и при включённом микрофоне. */
  isListening: boolean;
}

/** Цвета берём из темы: canvas понимает только вычисленные значения, не var(). */
function useThemeColors(elementRef: React.RefObject<HTMLElement | null>) {
  const [colors, setColors] = useState({ main: "#e5484d", secondary: "#3f3f46" });

  useEffect(() => {
    if (!elementRef.current) return;

    const styles = getComputedStyle(elementRef.current);
    const read = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback;

    setColors({
      main: read("--accent-9", "#e5484d"),
      secondary: read("--gray-6", "#3f3f46"),
    });
  }, [elementRef]);

  return colors;
}

function VoiceVisualizerPanelImpl({ isListening }: VoiceVisualizerPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const colors = useThemeColors(containerRef);
  const controls = useVoiceVisualizer();
  const { startRecording, stopRecording, error } = controls;
  const wasListeningRef = useRef(false);

  // Реагируем только на смену состояния. Если смотреть на isRecordingInProgress,
  // то каждый рендер до готовности getUserMedia запускает ещё одну запись —
  // несколько потоков рисуют в один канвас, и полосы скачут по ширине.
  useEffect(() => {
    if (isListening === wasListeningRef.current) return;
    wasListeningRef.current = isListening;

    if (isListening) startRecording();
    else stopRecording();
  }, [isListening, startRecording, stopRecording]);

  return (
    <div ref={containerRef} className="min-h-14">
      {error ? (
        <Flex align="center" justify="center" gap="2" className="h-14">
          <MicOff size={14} aria-hidden />
          <Text size="1" color="gray">
            Микрофон недоступен
          </Text>
        </Flex>
      ) : (
        <VoiceVisualizer
          controls={controls}
          height={VISUALIZER_HEIGHT}
          width="100%"
          barWidth={3}
          gap={2}
          rounded={3}
          backgroundColor="transparent"
          mainBarColor={colors.main}
          secondaryBarColor={colors.secondary}
          isControlPanelShown={false}
          isDownloadAudioButtonShown={false}
          isDefaultUIShown={false}
          isProgressIndicatorShown={false}
          isProgressIndicatorTimeShown={false}
          onlyRecording
        />
      )}
    </div>
  );
}

/**
 * Таймер разговора перерисовывает карточку раз в секунду — без memo канвас
 * пересчитывал бы ширину на каждый тик.
 */
export const VoiceVisualizerPanel = memo(VoiceVisualizerPanelImpl);
