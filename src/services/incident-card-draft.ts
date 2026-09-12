import {
  IncidentCardSchema,
  type IncidentCard,
  type IncidentCardPatch,
} from "../contracts/incident";

export interface IncidentCardLocationDefaults {
  addressText?: string;
  latitude?: number;
  longitude?: number;
}

interface DraftScheduler {
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

interface IncidentCardDraftOptions {
  save: (card: IncidentCard) => Promise<void>;
  saveDelayMs?: number;
  scheduler?: DraftScheduler;
  onSavingChange?: (isSaving: boolean) => void;
  onSaved?: () => void;
  onError?: (reason: unknown) => void;
}

const defaultScheduler: DraftScheduler = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

/**
 * Геолокатор задаёт стартовые значения, но не имеет права затирать карточку,
 * которую оператор уже заполнил или которая была восстановлена с backend.
 */
export function applyIncidentCardLocationDefaults(
  card: IncidentCard,
  defaults: IncidentCardLocationDefaults,
): IncidentCard {
  return IncidentCardSchema.parse({
    ...card,
    addressText: card.addressText || defaults.addressText || null,
    latitude: card.latitude ?? defaults.latitude ?? null,
    longitude: card.longitude ?? defaults.longitude ?? null,
  });
}

/**
 * Единый черновик карточки для всех колонок окна звонка.
 *
 * Последовательная очередь не даёт более раннему запросу завершиться после
 * нового и затереть его. `flush` используется перед завершением звонка, когда
 * ждать обычный debounce уже нельзя.
 */
export class IncidentCardDraft {
  private readonly save: (card: IncidentCard) => Promise<void>;
  private readonly saveDelayMs: number;
  private readonly scheduler: DraftScheduler;
  private readonly onSavingChange?: (isSaving: boolean) => void;
  private readonly onSaved?: () => void;
  private readonly onError?: (reason: unknown) => void;

  private current?: IncidentCard;
  private pending?: IncidentCard;
  private timer?: unknown;
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(options: IncidentCardDraftOptions) {
    this.save = options.save;
    this.saveDelayMs = options.saveDelayMs ?? 1_500;
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.onSavingChange = options.onSavingChange;
    this.onSaved = options.onSaved;
    this.onError = options.onError;
  }

  load(
    card: IncidentCard,
    defaults: IncidentCardLocationDefaults = {},
  ): IncidentCard {
    this.cancelTimer();
    this.pending = undefined;

    const next = applyIncidentCardLocationDefaults(card, defaults);
    this.current = next;

    if (
      next.addressText !== card.addressText ||
      next.latitude !== card.latitude ||
      next.longitude !== card.longitude
    ) {
      this.pending = next;
      this.armTimer();
    }

    return next;
  }

  getSnapshot(): IncidentCard | undefined {
    return this.current;
  }

  update(patch: IncidentCardPatch): IncidentCard | undefined {
    if (!this.current) return undefined;

    const next = IncidentCardSchema.parse({ ...this.current, ...patch });
    this.current = next;
    this.pending = next;
    this.armTimer();

    return next;
  }

  async flush(): Promise<void> {
    for (;;) {
      this.cancelTimer();

      const snapshot = this.pending;
      if (!snapshot) {
        await this.saveQueue;
        if (!this.pending) return;
        continue;
      }

      this.pending = undefined;
      const operation = this.saveQueue
        .catch(() => undefined)
        .then(async () => {
          this.onSavingChange?.(true);

          try {
            await this.save(snapshot);
            this.onSaved?.();
          } finally {
            this.onSavingChange?.(false);
          }
        });

      this.saveQueue = operation;

      try {
        await operation;
      } catch (reason) {
        // Новый черновик уже содержит предыдущие изменения, поэтому старую
        // версию возвращаем в pending только если пользователь ничего не менял.
        this.pending ??= snapshot;
        this.onError?.(reason);
        throw reason;
      }
    }
  }

  dispose(flushPending: boolean): void {
    this.cancelTimer();

    if (flushPending) {
      void this.flush().catch(() => undefined);
    } else {
      this.pending = undefined;
    }
  }

  private armTimer(): void {
    this.cancelTimer();
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = undefined;
      void this.flush().catch(() => undefined);
    }, this.saveDelayMs);
  }

  private cancelTimer(): void {
    if (this.timer === undefined) return;

    this.scheduler.clearTimeout(this.timer);
    this.timer = undefined;
  }
}
