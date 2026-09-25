import { z } from "zod";

import {
  OPERATOR_PHONE_WINDOW_LABEL,
  OPERATOR_PHONE_WINDOW_URL,
} from "../config/routes";

export const OPERATOR_PHONE_CHANNEL_NAME = "system112-operator-phone";

/** Реплика разговора в том виде, в каком её переживает пересылка между окнами. */
export const PhoneDialogueTurnSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(["operator", "caller"]),
    text: z.string(),
  })
  .strict();

/**
 * Что окно телефона знает о звонке.
 *
 * Сам звонок остаётся в рабочем месте: там сокет, микрофон и карточка. Окну
 * достаётся только то, что оно показывает, — иначе два окна вели бы каждое
 * свой разговор.
 */
export const PhoneCallSnapshotSchema = z
  .object({
    state: z.enum(["idle", "ringing", "active", "ended"]),
    callerNumber: z.string().nullable(),
    scenarioTitle: z.string().nullable(),
    elapsedSeconds: z.number().int().min(0),
    answerNormSeconds: z.number().int().min(0),
    isMuted: z.boolean(),
    isListening: z.boolean(),
    isCallerSpeaking: z.boolean(),
    isRecovering: z.boolean(),
    dialogue: z.array(PhoneDialogueTurnSchema),
  })
  .strict();

/** Команды телефона: трубка и микрофон — всё, чем он управляет. */
export const PHONE_COMMANDS = ["toggle-mute", "end"] as const;

export const PhoneWindowMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello") }).strict(),
  z
    .object({ type: z.literal("command"), command: z.enum(PHONE_COMMANDS) })
    .strict(),
]);

export const PhoneHostMessageSchema = z
  .object({
    type: z.literal("snapshot"),
    snapshot: PhoneCallSnapshotSchema,
  })
  .strict();

export type PhoneCallSnapshot = z.infer<typeof PhoneCallSnapshotSchema>;
export type PhoneCommand = (typeof PHONE_COMMANDS)[number];

const channel = () =>
  "BroadcastChannel" in globalThis
    ? new BroadcastChannel(OPERATOR_PHONE_CHANNEL_NAME)
    : null;

/**
 * Сторона рабочего места: отдаёт снимок звонка и принимает команды телефона.
 *
 * Снимок уходит и по своему таймеру, и в ответ на `hello`: окно могли открыть
 * посреди разговора, и оно должно увидеть его целиком, а не с ближайшего
 * изменения.
 */
export function createPhoneHostChannel(
  onCommand: (command: PhoneCommand) => void,
) {
  const bus = channel();
  let latest: PhoneCallSnapshot | null = null;

  const publish = (snapshot: PhoneCallSnapshot) => {
    latest = snapshot;
    bus?.postMessage({ type: "snapshot", snapshot });
  };

  const onMessage = (event: MessageEvent) => {
    const parsed = PhoneWindowMessageSchema.safeParse(event.data);
    if (!parsed.success) return;

    if (parsed.data.type === "hello") {
      if (latest) bus?.postMessage({ type: "snapshot", snapshot: latest });
      return;
    }

    onCommand(parsed.data.command);
  };

  bus?.addEventListener("message", onMessage);

  return {
    publish,
    dispose() {
      bus?.removeEventListener("message", onMessage);
      bus?.close();
    },
  };
}

/** Сторона окна телефона: слушает снимки и отправляет команды. */
export function createPhoneWindowChannel(
  onSnapshot: (snapshot: PhoneCallSnapshot) => void,
) {
  const bus = channel();

  const onMessage = (event: MessageEvent) => {
    const parsed = PhoneHostMessageSchema.safeParse(event.data);
    if (parsed.success) onSnapshot(parsed.data.snapshot);
  };

  bus?.addEventListener("message", onMessage);
  bus?.postMessage({ type: "hello" });

  return {
    send(command: PhoneCommand) {
      bus?.postMessage({ type: "command", command });
    },
    dispose() {
      bus?.removeEventListener("message", onMessage);
      bus?.close();
    },
  };
}

/** Открывает окно телефона: отдельное окно браузера того же приложения. */
export function openOperatorPhoneWindow(): Promise<void> {
  const popup = window.open(
    OPERATOR_PHONE_WINDOW_URL,
    OPERATOR_PHONE_WINDOW_LABEL,
    "popup=yes,width=460,height=760,resizable=yes",
  );

  if (!popup) {
    throw new Error(
      "Браузер заблокировал окно телефона. Разрешите всплывающие окна для приложения",
    );
  }

  popup.focus();
  return Promise.resolve();
}
