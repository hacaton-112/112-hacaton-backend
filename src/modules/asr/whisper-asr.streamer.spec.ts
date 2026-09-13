jest.mock("@/core/config/env.config", () => ({
  env: { ASR_SERVICE_URL: "http://127.0.0.1:8787" },
}));

import { EventEmitter } from "node:events";

import { Logger } from "@nestjs/common";

import type { AsrSocket } from "./asr-stream.port";
import type { AsrService } from "./asr.service";
import { buildAsrSocketUrl, WhisperAsrStreamer } from "./whisper-asr.streamer";

class SocketMock extends EventEmitter implements AsrSocket {
  public readonly sent: (Uint8Array | string)[] = [];
  public closed = false;

  send(data: Uint8Array | string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }

  /**
   * Сокет соединяется не в том же тике, в котором его создали, поэтому мок
   * тоже ждёт: иначе событие ушло бы до того, как поток на него подписался.
   */
  async emitReady(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));

    this.emit("open");
  }

  emitEvent(event: Record<string, unknown>): void {
    this.emit("message", JSON.stringify(event));
  }
}

const createStreamer = (): {
  streamer: WhisperAsrStreamer;
  socket: SocketMock;
  createSession: jest.Mock;
} => {
  const socket = new SocketMock();
  const createSession = jest
    .fn()
    .mockResolvedValue({ sessionId: "asr-session-1" });
  const asr = { createSession } as unknown as AsrService;

  return {
    streamer: new WhisperAsrStreamer(asr, () => socket),
    socket,
    createSession,
  };
};

const openStream = async (): Promise<{
  stream: Awaited<ReturnType<WhisperAsrStreamer["open"]>>;
  socket: SocketMock;
}> => {
  const { streamer, socket } = createStreamer();
  const opening = streamer.open("ru");

  await socket.emitReady();

  return { stream: await opening, socket };
};

describe("buildAsrSocketUrl", () => {
  it("derives the socket address from the service url", () => {
    expect(buildAsrSocketUrl("http://127.0.0.1:8787", "abc")).toBe(
      "ws://127.0.0.1:8787/v1/ws/abc",
    );
    expect(buildAsrSocketUrl("https://asr.example/", "abc")).toBe(
      "wss://asr.example/v1/ws/abc",
    );
  });
});

describe(WhisperAsrStreamer.name, () => {
  it("opens a session in the requested language", async () => {
    const { streamer, socket, createSession } = createStreamer();
    const opening = streamer.open("ru");

    await socket.emitReady();
    await opening;

    expect(createSession).toHaveBeenCalledWith("ru");
  });

  it("forwards audio frames untouched", async () => {
    const { stream, socket } = await openStream();
    const chunk = new Uint8Array([1, 2, 3, 4]);

    stream.send(chunk);

    expect(socket.sent).toEqual([chunk]);
  });

  it("asks for the final transcript and closes the stream", async () => {
    const { stream, socket } = await openStream();
    const finishing = stream.finish();

    expect(socket.sent).toContain('{"type":"stop"}');

    socket.emitEvent({
      type: "final",
      transcript: "Назовите адрес",
      audioMs: 2_400,
      processingMs: 180,
    });

    await expect(finishing).resolves.toEqual({
      transcript: "Назовите адрес",
      audioMs: 2_400,
      processingMs: 180,
    });
    expect(socket.closed).toBe(true);
  });

  it("stitches the phrases the service split on a pause", async () => {
    const { stream, socket } = await openStream();

    socket.emitEvent({
      type: "final",
      transcript: " Служба 112, что случилось?",
      audioMs: 2_100,
      processingMs: 140,
      reason: "silence",
    });

    const finishing = stream.finish();

    socket.emitEvent({
      type: "final",
      transcript: " Назовите адрес",
      audioMs: 1_500,
      processingMs: 120,
      reason: "stop",
    });

    await expect(finishing).resolves.toEqual({
      transcript: "Служба 112, что случилось? Назовите адрес",
      audioMs: 3_600,
      processingMs: 260,
    });
  });

  it("keeps a phrase finished before the operator released the button", async () => {
    const { stream, socket } = await openStream();

    // Пауза посреди вопроса заканчивала фразу, и до этой правки всё сказанное
    // до неё выбрасывалось: колбэка ещё не было, а финал по stop приходил
    // пустым хвостом.
    socket.emitEvent({
      type: "final",
      transcript: "В квартире есть люди?",
      audioMs: 1_900,
      processingMs: 150,
      reason: "silence",
    });

    const finishing = stream.finish();

    socket.emitEvent({
      type: "final",
      transcript: "",
      audioMs: 40,
      processingMs: 0,
      reason: "stop",
    });

    await expect(finishing).resolves.toEqual({
      transcript: "В квартире есть люди?",
      audioMs: 1_940,
      processingMs: 150,
    });
  });

  it("joins the phrases in the order they were spoken", async () => {
    const { stream, socket } = await openStream();

    for (const transcript of [" Алло.", " Я вас слышу.", " Говорите."]) {
      socket.emitEvent({
        type: "final",
        transcript,
        audioMs: 500,
        processingMs: 40,
        reason: "silence",
      });
    }

    const finishing = stream.finish();

    socket.emitEvent({
      type: "final",
      transcript: "",
      audioMs: 0,
      processingMs: 0,
      reason: "stop",
    });

    await expect(finishing).resolves.toMatchObject({
      transcript: "Алло. Я вас слышу. Говорите.",
    });
  });

  it("ends the utterance on a reason it has never heard of", async () => {
    const { stream, socket } = await openStream();
    const finishing = stream.finish();

    // Незнакомая причина обязана считаться терминальной: иначе ход повиснет до
    // истечения таймаута, и оператор потеряет реплику на ровном месте.
    socket.emitEvent({
      type: "final",
      transcript: "Улица Учебная",
      audioMs: 900,
      processingMs: 60,
      reason: "cancelled",
    });

    await expect(finishing).resolves.toMatchObject({
      transcript: "Улица Учебная",
    });
  });

  it("keeps what it heard when the stream dies after a phrase", async () => {
    const { stream, socket } = await openStream();

    socket.emitEvent({
      type: "final",
      transcript: "Горит квартира",
      audioMs: 1_100,
      processingMs: 80,
      reason: "silence",
    });

    const finishing = stream.finish();

    socket.emit("close");

    await expect(finishing).resolves.toMatchObject({
      transcript: "Горит квартира",
    });
  });

  it("returns a phrase collected before the stream broke, without asking again", async () => {
    const { stream, socket } = await openStream();

    socket.emitEvent({
      type: "final",
      transcript: "Пятый этаж",
      audioMs: 800,
      processingMs: 50,
      reason: "silence",
    });
    socket.emitEvent({
      type: "error",
      message: "maximum audio duration is 120 seconds",
    });
    socket.emit("close");

    await expect(stream.finish()).resolves.toMatchObject({
      transcript: "Пятый этаж",
    });
    // Мёртвому сокету просить нечего.
    expect(socket.sent).not.toContain('{"type":"stop"}');
  });

  it("still reports a lost utterance when nothing was heard at all", async () => {
    const { stream, socket } = await openStream();

    socket.emitEvent({
      type: "error",
      message: "voice activity detection failed",
    });
    socket.emit("close");

    await expect(stream.finish()).rejects.toThrow(
      "voice activity detection failed",
    );
  });

  it("accepts a ready event that announces the silence timeout", async () => {
    const warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const { stream, socket } = await openStream();

    socket.emitEvent({
      type: "ready",
      sessionId: "asr-session-1",
      sampleRate: 16_000,
      model: "ggml-large-v3-turbo.bin",
      endpointSilenceMs: 800,
    });

    const finishing = stream.finish();

    socket.emitEvent({
      type: "final",
      transcript: "Да",
      audioMs: 300,
      processingMs: 20,
      reason: "stop",
    });

    await expect(finishing).resolves.toMatchObject({ transcript: "Да" });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ignores partial results, which the operator never sees", async () => {
    const { stream, socket } = await openStream();
    const finishing = stream.finish();

    socket.emitEvent({
      type: "partial",
      transcript: "Назов",
      audioMs: 1_200,
      processingMs: 90,
    });
    socket.emitEvent({
      type: "final",
      transcript: "Назовите адрес",
      audioMs: 2_400,
      processingMs: 180,
    });

    await expect(finishing).resolves.toMatchObject({
      transcript: "Назовите адрес",
    });
  });

  it("reports a service error instead of returning empty speech", async () => {
    const { stream, socket } = await openStream();
    const finishing = stream.finish();

    socket.emitEvent({ type: "error", message: "maximum audio duration" });

    await expect(finishing).rejects.toThrow("maximum audio duration");
  });

  it("reports an error raised while the operator was still speaking", async () => {
    const { stream, socket } = await openStream();

    socket.emitEvent({ type: "error", message: "decoder is busy" });

    await expect(stream.finish()).rejects.toThrow("decoder is busy");
  });

  it("treats a stream closed before the final as a lost utterance", async () => {
    const { stream, socket } = await openStream();
    const finishing = stream.finish();

    socket.emit("close");

    await expect(finishing).rejects.toThrow("before the final result");
  });

  it("drops frames once the stream is done", async () => {
    const { stream, socket } = await openStream();

    stream.abort();
    stream.send(new Uint8Array([9]));

    expect(socket.sent).toEqual([]);
  });
});
