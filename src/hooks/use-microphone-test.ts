import { Channel } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

import { ipc } from "../lib/ipc";

interface MicrophoneTestOptions {
  inputDevice: string | null;
  inputGain: number;
  outputDevice: string | null;
  outputVolume: number;
}

interface MicrophoneTestEvent {
  kind?: string;
  level?: number;
  message?: string;
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

  useEffect(() => {
    gainRef.current = inputGain;
    volumeRef.current = outputVolume;
    activeRef.current = active;
  }, [inputGain, outputVolume, active]);

  const stop = useCallback(async () => {
    setActive(false);
    setLevel(0);
    await ipc.audio.stopTest().catch(() => undefined);
  }, []);

  const start = useCallback(async () => {
    const channel = new Channel<unknown>();
    channel.onmessage = (payload) => {
      const event = payload as MicrophoneTestEvent;
      if (event.kind === "level" && typeof event.level === "number") {
        // Быстрый подъём и плавный спад, чтобы индикатор не мерцал.
        const next = event.level;
        setLevel((previous) => (next >= previous ? next : previous * 0.8));
      } else if (event.kind === "failure") {
        setError(event.message ?? "Микрофон перестал отвечать");
        void stop();
      }
    };

    setError(null);
    try {
      await ipc.audio.startTest(channel, {
        inputDevice,
        inputGain: gainRef.current,
        outputDevice,
        outputVolume: volumeRef.current,
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
      void ipc.audio.stopTest().catch(() => undefined);
    },
    [],
  );

  return { active, error, level, toggle };
}
