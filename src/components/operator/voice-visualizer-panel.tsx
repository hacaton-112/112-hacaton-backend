import { memo, useEffect, useRef, useState } from "react";

import { microphoneLevelStore } from "../../services/call.service";

const VISUALIZER_HEIGHT = 32;
const BAR_WIDTH = 1;
const BAR_GAP = 1;
/** Шаг волны: полоса добавляется и в тишине, чтобы волна не замирала. */
const SAMPLE_INTERVAL_MS = 40;
const MAX_HISTORY = 1_200;

interface VoiceVisualizerPanelProps {
  /** Во время разговора поток постоянный; false означает ручное отключение. */
  isListening: boolean;
}

/** Цвета берём из темы: canvas понимает только вычисленные значения, не var(). */
function useThemeColors(elementRef: React.RefObject<HTMLElement | null>) {
  const [colors, setColors] = useState({
    main: "#e5484d",
    secondary: "#3f3f46",
  });

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

/**
 * Волна речи оператора.
 *
 * Микрофон здесь не открывается: уровень приходит из того же нативного
 * захвата, что отправляет речь на распознавание. Раньше панель делала второй
 * захват через getUserMedia, и на macOS голосовая обработка WebKit глушила
 * весь звук системы — вплоть до закрытия приложения.
 */
function VoiceVisualizerPanelImpl({ isListening }: VoiceVisualizerPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<number[]>([]);
  const frameRef = useRef<number | null>(null);
  const colors = useThemeColors(containerRef);

  const draw = () => {
    frameRef.current = null;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    if (canvas.width !== Math.round(width * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(VISUALIZER_HEIGHT * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, VISUALIZER_HEIGHT);

    const step = BAR_WIDTH + BAR_GAP;
    const history = historyRef.current;
    const count = Math.min(history.length, Math.floor(width / step));

    // Новые полосы появляются справа и уезжают влево, как при записи.
    for (let index = 0; index < count; index += 1) {
      const value = history[history.length - count + index] ?? 0;
      const height = Math.max(1, value * VISUALIZER_HEIGHT);
      context.fillStyle = value > 0 ? colors.main : colors.secondary;
      context.fillRect(
        width - (count - index) * step,
        (VISUALIZER_HEIGHT - height) / 2,
        BAR_WIDTH,
        height,
      );
    }
  };
  const drawRef = useRef(draw);

  useEffect(() => {
    drawRef.current = draw;
  });

  const scheduleDraw = () => {
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(() => drawRef.current());
    }
  };

  // Уровень читаем из хранилища без setState: 50 обновлений в секунду не
  // должны перерисовывать даже саму панель — канвас рисует таймер.
  const levelRef = useRef(microphoneLevelStore.get());

  useEffect(
    () =>
      microphoneLevelStore.subscribe((next) => {
        levelRef.current = next;
      }),
    [],
  );

  useEffect(() => {
    if (!isListening) return;

    const timer = window.setInterval(() => {
      const history = historyRef.current;
      history.push(isListening ? levelRef.current : 0);
      if (history.length > MAX_HISTORY) {
        history.splice(0, history.length - MAX_HISTORY);
      }
      scheduleDraw();
    }, SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isListening]);

  // Ширина и цвета меняются без новых уровней — перерисовываем то, что есть.
  useEffect(() => {
    scheduleDraw();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(() => scheduleDraw());
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [colors]);

  return (
    <div ref={containerRef} className="h-8">
      <canvas
        ref={canvasRef}
        className="block h-8 w-full"
        height={VISUALIZER_HEIGHT}
        aria-hidden
      />
    </div>
  );
}

/**
 * Таймер разговора перерисовывает карточку раз в секунду — без memo канвас
 * пересчитывал бы ширину на каждый тик.
 */
export const VoiceVisualizerPanel = memo(VoiceVisualizerPanelImpl);
