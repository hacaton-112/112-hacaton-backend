import type { ScenarioFact } from "@/contracts";

import { CallerReplyValidationError } from "@/modules/dialogue-generation/domain/caller-reply-validation.error";
import { CallerReplySafetyService } from "@/modules/dialogue-generation/application/caller-reply-safety.service";

const allowedFacts: ScenarioFact[] = [
  { id: "fire_location", value: "Возгорание находится на кухне" },
  { id: "caller_address", value: "Улица Учебная, дом 12" },
];

const validReply = {
  text: "Горит кухня, я нахожусь на улице Учебной!",
  emotion: "panic",
  intensity: 0.85,
  speechRate: 1.15,
  revealedFactIds: ["fire_location", "caller_address"],
  endCall: false,
} as const;

describe(CallerReplySafetyService.name, () => {
  const service = new CallerReplySafetyService();

  it("accepts a valid reply containing only allowed fact IDs", () => {
    expect(service.validate(validReply, allowedFacts)).toEqual(validReply);
  });

  it("keeps the words and drops a fact ID the scenario did not allow", () => {
    // The model never sees a hidden fact, so a stray identifier is a wrong
    // label rather than a leak — and it used to cost the operator the whole
    // reply.
    const validated = service.validate(
      {
        ...validReply,
        revealedFactIds: ["fire_location", "child_inside"],
      },
      allowedFacts,
    );

    expect(validated.text).toBe(validReply.text);
    expect(validated.revealedFactIds).toEqual(["fire_location"]);
  });

  it.each([
    ["duplicate fact IDs", ["fire_location", "fire_location"]],
    ["invalid fact IDs", ["fire location"]],
  ])("rejects %s", (_name, revealedFactIds) => {
    expect(() =>
      service.validate({ ...validReply, revealedFactIds }, allowedFacts),
    ).toThrow(
      expect.objectContaining<Partial<CallerReplyValidationError>>({
        reason: "invalid-schema",
      }),
    );
  });

  it("rejects replies with unknown fields", () => {
    expect(() =>
      service.validate(
        { ...validReply, internalReasoning: "Do not expose" },
        allowedFacts,
      ),
    ).toThrow(
      expect.objectContaining<Partial<CallerReplyValidationError>>({
        reason: "invalid-schema",
      }),
    );
  });
});

describe(`${CallerReplySafetyService.name} style values`, () => {
  const reply = (overrides: Record<string, unknown>) => ({
    text: "Горит квартира на пятом этаже.",
    emotion: "panic",
    intensity: 0.8,
    speechRate: 1.2,
    revealedFactIds: [],
    endCall: false,
    ...overrides,
  });

  it("keeps the words when the model reads intensity as a scale to ten", () => {
    const service = new CallerReplySafetyService();

    // Модель регулярно отвечает «3» или «8»; раньше реплика из-за этого
    // терялась целиком, и заявитель говорил запасную фразу.
    expect(service.validate(reply({ intensity: 8 }), []).intensity).toBe(1);
    expect(service.validate(reply({ intensity: -2 }), []).intensity).toBe(0);
  });

  it("brings an impossible speech rate back into range", () => {
    const service = new CallerReplySafetyService();

    expect(service.validate(reply({ speechRate: 5 }), []).speechRate).toBe(2);
    expect(service.validate(reply({ speechRate: 0.1 }), []).speechRate).toBe(
      0.5,
    );
  });

  it("leaves a sane reply exactly as it came", () => {
    const service = new CallerReplySafetyService();

    expect(service.validate(reply({}), [])).toMatchObject({
      intensity: 0.8,
      speechRate: 1.2,
    });
  });

  it("still strips a fact the caller was not allowed to reveal", () => {
    const service = new CallerReplySafetyService();

    const validated = service.validate(
      reply({ intensity: 8, revealedFactIds: ["address"] }),
      [],
    );

    expect(validated.revealedFactIds).toEqual([]);
  });

  it("does not invent numbers the model never sent", () => {
    const service = new CallerReplySafetyService();

    expect(() => service.validate(reply({ intensity: "громко" }), [])).toThrow(
      CallerReplyValidationError,
    );
  });
});
