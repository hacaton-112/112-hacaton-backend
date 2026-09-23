import {
  AriTelephonyControl,
  translateAriEvent,
} from "./ari-telephony.control";

const config = {
  url: "http://asterisk:8088",
  user: "system112",
  password: "secret",
  app: "crew-handoff",
  mediaHost: "backend",
  mediaBindHost: "127.0.0.1",
};

describe("translateAriEvent", () => {
  it("reads the caller and the dialed number of a new call", () => {
    expect(
      translateAriEvent({
        type: "StasisStart",
        args: ["1012"],
        channel: { id: "c-1", caller: { number: "201" } },
      }),
    ).toEqual({
      type: "call-started",
      channelId: "c-1",
      callerNumber: "201",
      dialedNumber: "1012",
    });
  });

  it("ignores internal media channels entering the same Stasis app", () => {
    expect(
      translateAriEvent({
        type: "StasisStart",
        args: ["crew-asr-media", "c-1"],
        channel: { id: "media-1" },
      }),
    ).toBeNull();
  });

  it("reads the explicit exercise of a click-to-call channel", () => {
    expect(
      translateAriEvent({
        type: "StasisStart",
        args: ["1012", "exercise-1", "event-1"],
        channel: { id: "c-1", caller: { number: "201" } },
      }),
    ).toMatchObject({
      exerciseId: "exercise-1",
      requestEventId: "event-1",
    });
  });

  it("finds the channel of a finished playback in its target", () => {
    expect(
      translateAriEvent({
        type: "PlaybackFinished",
        playback: { id: "p-1", target_uri: "channel:c-1" },
      }),
    ).toEqual({
      type: "playback-finished",
      channelId: "c-1",
      playbackId: "p-1",
    });
  });

  it("passes the length of a finished phrase", () => {
    expect(
      translateAriEvent({
        type: "ChannelTalkingFinished",
        duration: 2_400,
        channel: { id: "c-1" },
      }),
    ).toEqual({ type: "speech-finished", channelId: "c-1", durationMs: 2_400 });
  });

  it("ignores events the crew does not react to", () => {
    expect(
      translateAriEvent({ type: "ChannelVarset", channel: { id: "c-1" } }),
    ).toBeNull();
  });
});

describe(AriTelephonyControl.name, () => {
  it("originates an idempotent call to the operator's SIP endpoint", async () => {
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const control = new AriTelephonyControl(config, fetcher);

    await control.originate({
      endpoint: "PJSIP/201",
      appArgs: ["1012", "exercise-1", "event-1"],
      callerId: "201",
      channelId: "event-1",
      timeoutSeconds: 30,
    });

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      "http://asterisk:8088/ari/channels?endpoint=PJSIP%2F201&app=crew-handoff&appArgs=1012%2Cexercise-1%2Cevent-1&callerId=201&channelId=event-1&timeout=30",
    );
    expect(init?.method).toBe("POST");
  });

  it("returns the id of a playback it started", async () => {
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(Response.json({ id: "p-1" }, { status: 201 }));
    const control = new AriTelephonyControl(config, fetcher);

    await expect(control.play("c-1", "sound:crew/abc")).resolves.toBe("p-1");

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      "http://asterisk:8088/ari/channels/c-1/play?media=sound%3Acrew%2Fabc",
    );
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      Authorization: `Basic ${Buffer.from("system112:secret").toString("base64")}`,
    });
  });

  it("taps only inbound channel audio through external RTP media", async () => {
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const control = new AriTelephonyControl(config, fetcher);

    const tap = await control.captureInboundAudio("c-1", jest.fn());
    const urls = fetcher.mock.calls.map(([url]) => String(url));

    expect(
      urls.some(
        (url) => url.includes("/channels/c-1/snoop/") && url.includes("spy=in"),
      ),
    ).toBe(true);
    expect(
      urls.some(
        (url) =>
          url.includes("/channels/externalMedia?") &&
          url.includes("external_host=backend%3A") &&
          url.includes("format=ulaw"),
      ),
    ).toBe(true);
    expect(urls.some((url) => url.includes("/addChannel?channel="))).toBe(true);

    await tap.stop();
    await tap.stop();
    expect(
      fetcher.mock.calls.filter(([, init]) => init?.method === "DELETE"),
    ).toHaveLength(3);
  });

  it("treats hanging up a channel that is already gone as done", async () => {
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(new Response("Channel not found", { status: 404 }));

    await expect(
      new AriTelephonyControl(config, fetcher).hangUp("c-1"),
    ).resolves.toBeUndefined();
  });

  it("reports a refused command with the answer of Asterisk", async () => {
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        new Response("Channel not in Stasis", { status: 409 }),
      );

    await expect(
      new AriTelephonyControl(config, fetcher).answer("c-1"),
    ).rejects.toThrow("409 Channel not in Stasis");
  });
});
