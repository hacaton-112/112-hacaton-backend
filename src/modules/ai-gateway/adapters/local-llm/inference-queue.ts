export class LocalLlmBusyError extends Error {
  readonly status = 429;
  readonly retryable = false;
  constructor() {
    super("Local LLM queue is full or its wait budget expired");
  }
}

interface Waiter {
  grant: () => void;
  signal: AbortSignal;
  cancel: () => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Bounded FIFO for live turns. Background tools never queue or take the last live slot. */
export class InferenceQueue {
  private active = 0;
  private readonly waiting: Waiter[] = [];
  constructor(
    private readonly capacity: number,
    private readonly queueSize: number,
    private readonly waitMs: number,
  ) {}

  async acquire(signal: AbortSignal, background = false): Promise<() => void> {
    signal.throwIfAborted();
    if (
      this.active < this.capacity - (background ? 1 : 0) &&
      this.waiting.length === 0
    ) {
      this.active++;
      return this.releaseOnce();
    }
    if (background || this.waiting.length >= this.queueSize)
      throw new LocalLlmBusyError();
    return new Promise((resolve, reject) => {
      const remove = () => {
        const index = this.waiting.indexOf(waiter);
        if (index >= 0) this.waiting.splice(index, 1);
        clearTimeout(waiter.timer);
        signal.removeEventListener("abort", waiter.cancel);
      };
      const waiter: Waiter = {
        signal,
        cancel: () => {
          remove();
          reject(signal.reason);
        },
        grant: () => {
          remove();
          this.active++;
          resolve(this.releaseOnce());
        },
        timer: setTimeout(() => {
          remove();
          reject(new LocalLlmBusyError());
        }, this.waitMs),
      };
      this.waiting.push(waiter);
      signal.addEventListener("abort", waiter.cancel, { once: true });
      if (signal.aborted) waiter.cancel();
    });
  }

  private releaseOnce(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      while (this.active < this.capacity && this.waiting.length) {
        const next = this.waiting[0];
        if (next.signal.aborted) next.cancel();
        else next.grant();
      }
    };
  }
}
