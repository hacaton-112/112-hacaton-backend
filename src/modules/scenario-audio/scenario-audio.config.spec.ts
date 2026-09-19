import { parseScenarioAudioConfig } from "./scenario-audio.config";

describe("parseScenarioAudioConfig", () => {
  it("keeps the worker off until it is asked for", () => {
    expect(parseScenarioAudioConfig({})).toEqual({ workerEnabled: false });
  });

  it("turns the worker on", () => {
    expect(
      parseScenarioAudioConfig({ SCENARIO_AUDIO_WORKER_ENABLED: "true" }),
    ).toEqual({ workerEnabled: true });
  });

  it("refuses a value it cannot read", () => {
    // Иначе опечатка оставила бы очередь без движения молча.
    expect(() =>
      parseScenarioAudioConfig({ SCENARIO_AUDIO_WORKER_ENABLED: "1" }),
    ).toThrow();
  });
});
