import {
  CREW_ACKNOWLEDGEMENTS,
  CREW_CLOSING,
  crewPhrase,
  crewPhrases,
  crewPromptMedia,
  crewPromptName,
  resamplePcm16,
  signedLinearExtension,
} from "./crew-phrases";

describe("crew phrases", () => {
  it("greets with the callsign of the crew", () => {
    expect(crewPhrase("greeting", 0, "Пожарная часть 12")).toBe(
      "Пожарная часть 12, слушаю.",
    );
  });

  it("does not repeat the same acknowledgement twice in a row", () => {
    const said = [0, 1, 2, 3, 4].map((index) =>
      crewPhrase("acknowledgement", index, "ПСЧ-12"),
    );

    said.slice(1).forEach((phrase, index) => {
      expect(phrase).not.toBe(said[index]);
    });
    expect(said[4]).toBe(CREW_ACKNOWLEDGEMENTS[0]);
  });

  it("lists every line the crew can say, so all of them are prepared", () => {
    expect(crewPhrases("ПСЧ-12")).toEqual([
      "ПСЧ-12, слушаю.",
      ...CREW_ACKNOWLEDGEMENTS,
      CREW_CLOSING,
    ]);
  });

  it("names a prompt by its text and voice only", () => {
    const name = crewPromptName("Принял.", "ryan");

    expect(name).toMatch(/^[0-9a-f]{32}$/);
    expect(crewPromptName("Принял.", "ryan")).toBe(name);
    expect(crewPromptName("Принял.", "eric")).not.toBe(name);
    expect(crewPromptMedia(name)).toBe(`sound:crew/${name}`);
  });

  it("stores speech at the rate synthesis produced it", () => {
    expect(signedLinearExtension(24_000)).toBe("sln24");
    expect(signedLinearExtension(16_000)).toBe("sln16");
    expect(signedLinearExtension(22_050)).toBeNull();
  });

  it("resamples speech Asterisk has no format for", () => {
    const input = new Uint8Array(22_050 * 2);
    const view = new DataView(input.buffer);
    for (let index = 0; index < 22_050; index += 1) {
      view.setInt16(index * 2, 1_000, true);
    }

    const output = resamplePcm16(input, 22_050, 16_000);

    expect(output.byteLength).toBe(16_000 * 2);
    expect(new DataView(output.buffer).getInt16(2_000, true)).toBe(1_000);
  });
});
