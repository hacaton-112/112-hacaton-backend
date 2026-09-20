import {
  AriTelephonyControl,
  translateAriEvent,
} from "./ari-telephony.control";

const config = {
  url: "http://asterisk:8088",
  user: "system112",
  password: "secret",
  app: "crew-handoff",
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
