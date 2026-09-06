import type { ScenarioFact } from "@/contracts";

import { CallerReplyValidationError } from "../domain/caller-reply-validation.error";
import { CallerReplySafetyService } from "./caller-reply-safety.service";

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

  it("rejects a fact ID that was not allowed by the scenario context", () => {
    expect(() =>
      service.validate(
        {
          ...validReply,
          revealedFactIds: ["fire_location", "child_inside"],
        },
        allowedFacts,
      ),
    ).toThrow(
      expect.objectContaining<Partial<CallerReplyValidationError>>({
        reason: "forbidden-fact",
      }),
    );
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
