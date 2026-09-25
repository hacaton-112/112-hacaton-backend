import { InferenceQueue } from "@/modules/ai-gateway/infrastructure/local-llm/inference-queue";

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

  it("пропускает одновременные звонки по очереди, а не отказывает им", async () => {
    // Модель на процессоре отвечает по одному ходу: три оператора в занятии
    // должны получить настоящий ответ по очереди, а не заглушку.
    const queue = new InferenceQueue(1, 3, 1_000);
    const order: number[] = [];

    const turn = async (seat: number) => {
      const release = await queue.acquire(signal());
      order.push(seat);
      release();
    };

    const first = await queue.acquire(signal());
    const waiting = [turn(2), turn(3), turn(4)];
    first();
    await Promise.all(waiting);

    // Порядок сохраняется: кто раньше заговорил, тот раньше и услышит ответ.
    expect(order).toEqual([2, 3, 4]);
  });

  it("переполнение очереди не задевает уже идущие звонки", async () => {
    const queue = new InferenceQueue(1, 1, 1_000);
    const release = await queue.acquire(signal());
    const waiting = queue.acquire(signal());

    await expect(queue.acquire(signal())).rejects.toMatchObject({
      status: 429,
    });

    // Тот, кто уже стоял в очереди, своё место сохранил.
    release();
    (await waiting)();
  });

  it("ход, не дождавшийся своей очереди, освобождает место следующему", async () => {
    const queue = new InferenceQueue(1, 1, 20);
    const release = await queue.acquire(signal());

    await expect(queue.acquire(signal())).rejects.toMatchObject({
      status: 429,
    });

    release();
    (await queue.acquire(signal()))();
  });
});
