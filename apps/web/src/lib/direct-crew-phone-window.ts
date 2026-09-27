import { z } from "zod";

import { PHONE_WINDOW_LABEL, PHONE_WINDOW_URL } from "../config/routes";

export const DIRECT_CREW_PHONE_CHANNEL_NAME =
  "system112-dds-direct-crew-phone";

export const DirectCrewPhoneHostMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("discover"), requestId: z.uuid() }).strict(),
  z
    .object({
      type: z.literal("configure"),
      requestId: z.uuid(),
      accessToken: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("context"),
      requestId: z.uuid(),
      exerciseId: z.uuid(),
      crews: z.array(
        z
          .object({
            callsign: z.string().min(1),
            phoneNumber: z.string().regex(/^\d{1,12}$/u),
          })
          .strict(),
      ),
      canCall: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal("detach"), requestId: z.uuid() }).strict(),
]);

export const DirectCrewPhoneWindowMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), requestId: z.uuid() }).strict(),
  z.object({ type: z.literal("connected"), requestId: z.uuid() }).strict(),
  z
    .object({
      type: z.literal("error"),
      requestId: z.uuid(),
      message: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("call-state"),
      requestId: z.uuid(),
      state: z.enum(["connected", "ended", "error"]),
      message: z.string().min(1).optional(),
    })
    .strict(),
]);

export type DirectCrewPhoneHostMessage = z.infer<
  typeof DirectCrewPhoneHostMessageSchema
>;
export type DirectCrewPhoneWindowMessage = z.infer<
  typeof DirectCrewPhoneWindowMessageSchema
>;

export interface DirectCrewPhoneEntry {
  readonly callsign: string;
  readonly phoneNumber: string;
}

export interface DirectCrewPhoneWindowSession {
  connect(accessToken: string): Promise<void>;
  setContext(
    exerciseId: string,
    crews: readonly DirectCrewPhoneEntry[],
    canCall: boolean,
  ): void;
  onCallState(
    handler: (
      state: "connected" | "ended" | "error",
      message?: string,
    ) => void,
  ): () => void;
  dispose(): void;
}

const CONNECTION_TIMEOUT_MS = 15_000;
const DISCOVERY_INTERVAL_MS = 250;

export function prepareDirectCrewPhoneWindow(): DirectCrewPhoneWindowSession {
  if (!("BroadcastChannel" in globalThis)) {
    throw new Error("Этот браузер не поддерживает отдельное окно телефона");
  }

  const popup = window.open(
    PHONE_WINDOW_URL,
    PHONE_WINDOW_LABEL,
    "popup=yes,width=420,height=680,resizable=yes",
  );
  if (!popup) {
    throw new Error(
      "Браузер заблокировал окно телефона. Разрешите всплывающие окна для приложения",
    );
  }
  popup.focus();

  const requestId = crypto.randomUUID();
  const channel = new BroadcastChannel(DIRECT_CREW_PHONE_CHANNEL_NAME);
  let disposed = false;

  return {
    async connect(accessToken) {
      if (disposed) throw new Error("Окно телефона уже закрыто");

      await new Promise<void>((resolve, reject) => {
        let configured = false;
        const discover = () =>
          channel.postMessage({
            type: "discover",
            requestId,
          } satisfies DirectCrewPhoneHostMessage);
        const interval = window.setInterval(discover, DISCOVERY_INTERVAL_MS);
        const timeout = window.setTimeout(() => {
          cleanup();
          reject(new Error("Телефон не подготовился к звонку за 15 секунд"));
        }, CONNECTION_TIMEOUT_MS);
        const cleanup = () => {
          window.clearInterval(interval);
          window.clearTimeout(timeout);
          channel.removeEventListener("message", onMessage);
        };
        const onMessage = (event: MessageEvent<unknown>) => {
          const parsed = DirectCrewPhoneWindowMessageSchema.safeParse(
            event.data,
          );
          if (!parsed.success || parsed.data.requestId !== requestId) return;
          if (parsed.data.type === "ready" && !configured) {
            configured = true;
            channel.postMessage({
              type: "configure",
              requestId,
              accessToken,
            } satisfies DirectCrewPhoneHostMessage);
            return;
          }
          if (parsed.data.type === "connected") {
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
    setContext(exerciseId, crews, canCall) {
      if (disposed) return;
      channel.postMessage({
        type: "context",
        requestId,
        exerciseId,
        crews: crews.map(({ callsign, phoneNumber }) => ({
          callsign,
          phoneNumber,
        })),
        canCall,
      } satisfies DirectCrewPhoneHostMessage);
    },
    onCallState(handler) {
      const onMessage = (event: MessageEvent<unknown>) => {
        const parsed = DirectCrewPhoneWindowMessageSchema.safeParse(event.data);
        if (
          parsed.success &&
          parsed.data.type === "call-state" &&
          parsed.data.requestId === requestId
        ) {
          handler(parsed.data.state, parsed.data.message);
        }
      };
      channel.addEventListener("message", onMessage);
      return () => channel.removeEventListener("message", onMessage);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      channel.postMessage({
        type: "detach",
        requestId,
      } satisfies DirectCrewPhoneHostMessage);
      channel.close();
    },
  };
}
