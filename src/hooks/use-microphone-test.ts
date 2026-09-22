import { useCallback, useEffect, useRef, useState } from "react";
import { WebMicrophoneCapture } from "../lib/web-audio";

interface MicrophoneTestOptions {
  inputDevice: string | null;
  inputGain: number;
  outputDevice: string | null;
  outputVolume: number;
}

/**
 * Проверка микрофона как в Discord: уровень речи и самопрослушивание.
 * Усиление меняется на лету, смена устройства перезапускает проверку.
 */
export function useMicrophoneTest({
  inputDevice,
  inputGain,
  outputDevice,
  outputVolume,
}: MicrophoneTestOptions) {
  const [active, setActive] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const gainRef = useRef(inputGain);
  const volumeRef = useRef(outputVolume);
  const activeRef = useRef(active);
  const captureRef = useRef(new WebMicrophoneCapture());

  useEffect(() => {
    gainRef.current = inputGain;
    volumeRef.current = outputVolume;
    activeRef.current = active;
  }, [inputGain, outputVolume, active]);

  useEffect(() => {
    captureRef.current.setInputGain(inputGain);
  }, [inputGain]);

  useEffect(() => {
    captureRef.current.setOutputVolume(outputVolume);
  }, [outputVolume]);

  const stop = useCallback(async () => {
    setActive(false);
    setLevel(0);
    await captureRef.current.stop().catch(() => undefined);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      await captureRef.current.start({
        inputDevice,
        inputGain: gainRef.current,
        processing: false,
        onLevel: (next) =>
          setLevel((previous) => (next >= previous ? next : previous * 0.8)),
        onFailure: (message) => {
          setError(message);
          void stop();
        },
        monitor: { outputDevice, outputVolume: volumeRef.current },
      });
      setActive(true);
    } catch (reason) {
      setActive(false);
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [inputDevice, outputDevice, stop]);

  const toggle = useCallback(
    () => (active ? stop() : start()),
    [active, start, stop],
  );

  // Смена устройства во время проверки сразу применяется.
  useEffect(() => {
    if (activeRef.current) void start();
  }, [start]);

  useEffect(
    () => () => {
      void captureRef.current.stop().catch(() => undefined);
    },
    [],
  );

  return { active, error, level, toggle };
}
