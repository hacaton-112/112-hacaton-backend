import { z } from "zod";

import { PHONE_WINDOW_LABEL, PHONE_WINDOW_URL } from "../config/routes";
import {
  BrowserPhoneConfigSchema,
  type BrowserPhoneConfig,
} from "../contracts/telephony";

export const PHONE_CHANNEL_NAME = "system112-dds-browser-phone";

export const PhoneHostMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("discover"), requestId: z.uuid() }).strict(),
  z
    .object({
      type: z.literal("configure"),
      requestId: z.uuid(),
      config: BrowserPhoneConfigSchema,
    })
    .strict(),
]);

export const PhoneWindowMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), requestId: z.uuid() }).strict(),
  z
    .object({
      type: z.literal("registered"),
      requestId: z.uuid(),
      extension: z.string().regex(/^\d{2,6}$/u),
    })
    .strict(),
  z
    .object({
      type: z.literal("error"),
      requestId: z.uuid(),
      message: z.string().min(1),
    })
    .strict(),
  // Номер набирают в самом окне телефона, а звонок ставит рабочее место:
  // карточка знает, к какому упражнению его отнести.
  z
    .object({
      type: z.literal("dial"),
      requestId: z.uuid(),
      number: z.string().regex(/^\d{1,12}$/u),
    })
    .strict(),
]);

export type PhoneHostMessage = z.infer<typeof PhoneHostMessageSchema>;
export type PhoneWindowMessage = z.infer<typeof PhoneWindowMessageSchema>;

const REGISTRATION_TIMEOUT_MS = 15_000;
const DISCOVERY_INTERVAL_MS = 250;

export interface BrowserPhoneWindowSession {
  connect(config: BrowserPhoneConfig): Promise<void>;
  /** Набор в окне телефона: возвращает отписку. */
  onDial(handler: (number: string) => void): () => void;
  dispose(): void;
}

/**
 * Opens the shell synchronously so browser popup blockers see the user click.
 * Configuration is sent over a same-origin BroadcastChannel and never appears
 * in the URL or browser history.
 */
export function prepareBrowserPhoneWindow(): BrowserPhoneWindowSession {
  if (!("BroadcastChannel" in globalThis)) {
    throw new Error("Этот браузер не поддерживает окно WebRTC-телефона");
  }

  const opening = showPhoneWindow();
  const requestId = crypto.randomUUID();
  const channel = new BroadcastChannel(PHONE_CHANNEL_NAME);
  let disposed = false;

  return {
    async connect(config) {
      await opening;
      if (disposed) throw new Error("Окно телефона уже закрыто");

      await new Promise<void>((resolve, reject) => {
        let configured = false;
        const discover = () =>
          channel.postMessage({
            type: "discover",
            requestId,
          } satisfies PhoneHostMessage);
        const interval = window.setInterval(discover, DISCOVERY_INTERVAL_MS);
        const timeout = window.setTimeout(() => {
          cleanup();
          reject(
            new Error(
              "Окно телефона не зарегистрировалось в Asterisk за 15 секунд",
            ),
          );
        }, REGISTRATION_TIMEOUT_MS);

        const cleanup = () => {
          window.clearInterval(interval);
          window.clearTimeout(timeout);
          channel.removeEventListener("message", onMessage);
        };
        const onMessage = (event: MessageEvent<unknown>) => {
          const parsed = PhoneWindowMessageSchema.safeParse(event.data);
          if (!parsed.success || parsed.data.requestId !== requestId) return;

          if (parsed.data.type === "ready" && !configured) {
            configured = true;
            channel.postMessage({
              type: "configure",
              requestId,
              config,
            } satisfies PhoneHostMessage);
            return;
          }
          if (parsed.data.type === "registered") {
            cleanup();
            resolve();
            return;
          }
          if (parsed.data.type === "error") {
            cleanup();
            reject(new Error(parsed.data.message));
          }
        };

        channel.addEventListener("message", onMessage);
        discover();
      });
    },
    onDial(handler) {
      const onMessage = (event: MessageEvent<unknown>) => {
        const parsed = PhoneWindowMessageSchema.safeParse(event.data);
        if (
          parsed.success &&
          parsed.data.type === "dial" &&
          parsed.data.requestId === requestId
        ) {
          handler(parsed.data.number);
        }
      };

      channel.addEventListener("message", onMessage);

      return () => channel.removeEventListener("message", onMessage);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      channel.close();
    },
  };
}

function showPhoneWindow(): Promise<void> {
  const popup = window.open(
    PHONE_WINDOW_URL,
    PHONE_WINDOW_LABEL,
    "popup=yes,width=420,height=680,resizable=yes",
  );
  if (!popup)
    throw new Error(
      "Браузер заблокировал окно телефона. Разрешите всплывающие окна для приложения",
    );
  popup.focus();
  return Promise.resolve();
}
