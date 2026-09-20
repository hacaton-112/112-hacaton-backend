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

export interface TelephonyControlPort {
  /** Подписка на события линии; возвращает отписку. */
  subscribe(listener: (event: TelephonyEvent) => void): () => void;
  answer(channelId: string): Promise<void>;
  /** Включает определение речи: без него не узнать, что диспетчер договорил. */
  detectSpeech(channelId: string): Promise<void>;
  /** Воспроизводит звук и возвращает идентификатор воспроизведения. */
  play(channelId: string, media: string): Promise<string>;
  hangUp(channelId: string): Promise<void>;
}

export const TELEPHONY_CONTROL = Symbol("TELEPHONY_CONTROL");
