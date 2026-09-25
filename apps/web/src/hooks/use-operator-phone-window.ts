import { useEffect, useRef } from "react";

import {
  createPhoneHostChannel,
  type PhoneCallSnapshot,
} from "../lib/operator-phone-window";
import type { CallControls, CallSnapshot } from "./use-call";

type PhoneHostCall = CallSnapshot &
  Pick<CallControls, "toggleMute"> & { onEnd: () => void };

/**
 * Держит окно телефона в курсе идущего звонка.
 *
 * Звонок живёт здесь, в рабочем месте: сокет, микрофон и карточка — всё в
 * одном окне. Телефон получает только снимок и возвращает нажатия, поэтому
 * закрытие окна разговор не обрывает.
 */
export function useOperatorPhoneWindow(call: PhoneHostCall): void {
  // Команды приходят из другого окна, и обработчик не должен пересоздавать
  // канал на каждый тик таймера.
  const latest = useRef(call);
  const channelRef = useRef<ReturnType<typeof createPhoneHostChannel>>(null);

  useEffect(() => {
    latest.current = call;
  });

  useEffect(() => {
    const channel = createPhoneHostChannel((command) => {
      if (command === "toggle-mute") {
        latest.current.toggleMute();
        return;
      }

      latest.current.onEnd();
    });
    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      channel.dispose();
    };
  }, []);

  const snapshot: PhoneCallSnapshot = {
    state: call.state,
    callerNumber: call.callerNumber ?? null,
    scenarioTitle: call.scenarioTitle ?? null,
    elapsedSeconds: call.elapsedSeconds,
    answerNormSeconds: call.answerNormSeconds,
    isMuted: call.isMuted,
    isListening: call.isListening,
    isCallerSpeaking: call.isCallerSpeaking,
    isRecovering: call.isRecovering,
    dialogue: call.dialogue.map(({ id, role, text }) => ({ id, role, text })),
  };
  const serialized = JSON.stringify(snapshot);

  useEffect(() => {
    channelRef.current?.publish(JSON.parse(serialized) as PhoneCallSnapshot);
  }, [serialized]);
}
