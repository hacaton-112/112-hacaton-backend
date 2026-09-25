import { InferenceQueue } from "./inference-queue";

describe(InferenceQueue.name, () => {
  const signal = () => new AbortController().signal;
  it("bounds the FIFO and reserves the last slot for live work", async () => {
    const queue = new InferenceQueue(1, 1, 500);
    await expect(queue.acquire(signal(), true)).rejects.toMatchObject({
      status: 429,
    });
    const release = await queue.acquire(signal());
    const waiting = queue.acquire(signal());
    await expect(queue.acquire(signal())).rejects.toMatchObject({
      status: 429,
    });
    release();
    release();
    const second = await waiting;
    second();
    (await queue.acquire(signal()))();
  });
  it("removes cancelled and expired waiters", async () => {
    const queue = new InferenceQueue(1, 1, 10);
    const release = await queue.acquire(signal());
    const controller = new AbortController();
    const waiting = queue.acquire(controller.signal);
    const rejection = expect(waiting).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await rejection;
    await expect(queue.acquire(signal())).rejects.toMatchObject({
      status: 429,
    });
    release();
    (await queue.acquire(signal()))();
  });
});
