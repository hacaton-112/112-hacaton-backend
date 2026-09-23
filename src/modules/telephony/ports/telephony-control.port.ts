/**
 * Что происходит на линии учебной АТС.
 *
 * Порт знает только о звонках и звуке — ни о нарядах, ни о карточках. Так
 * сценарий наряда не зависит от того, отвечает ли на звонок Asterisk через ARI
 * или в будущем другая АТС.
 */
export type TelephonyEvent =
  | {
      readonly type: "call-started";
      readonly channelId: string;
      /** Внутренний номер рабочего места, с которого звонят. */
      readonly callerNumber: string;
      /** Набранный номер наряда. */
      readonly dialedNumber: string;
      /** Экранный телефон передаёт карточку явно; ручной набор оставляет поле пустым. */
      readonly exerciseId?: string;
      readonly requestEventId?: string;
    }
  | {
      readonly type: "playback-finished";
      readonly channelId: string;
      readonly playbackId: string;
    }
  | { readonly type: "speech-started"; readonly channelId: string }
  | {
      readonly type: "speech-finished";
      readonly channelId: string;
      readonly durationMs: number;
    }
  | { readonly type: "call-ended"; readonly channelId: string };

export interface TelephonyAudioTap {
  /** Идемпотентно останавливает захват и освобождает ресурсы АТС. */
  stop(): Promise<void>;
}

export interface TelephonyControlPort {
  /** Подключение к АТС; переподключается само, пока не остановлено. */
  start(): void;
  stop(): void;
  /** Подписка на события линии; возвращает отписку. */
  subscribe(listener: (event: TelephonyEvent) => void): () => void;
  /** Звонит на SIP-устройство и после ответа передаёт канал приложению Stasis. */
  originate(input: {
    readonly endpoint: string;
    readonly appArgs: readonly string[];
    readonly callerId: string;
    readonly channelId: string;
    readonly timeoutSeconds: number;
  }): Promise<void>;
  answer(channelId: string): Promise<void>;
  /**
   * Отдаёт только входящую речь SIP-абонента как PCM16 LE 16 кГц моно.
   * Реплики виртуального наряда, проигрываемые в канал, в поток не попадают.
   */
  captureInboundAudio(
    channelId: string,
    onAudio: (chunk: Uint8Array) => void,
  ): Promise<TelephonyAudioTap>;
  /** Воспроизводит звук и возвращает идентификатор воспроизведения. */
  play(channelId: string, media: string): Promise<string>;
  hangUp(channelId: string): Promise<void>;
}

export const TELEPHONY_CONTROL = Symbol("TELEPHONY_CONTROL");
