import type { CallerReply, GenerateCallerReplyRequest } from "@/contracts";
import { assertCallerReplyContent } from "./caller-reply-content";
import { REACTION_ACT_INSTRUCTIONS } from "./reaction-instructions";

const request: GenerateCallerReplyRequest = {
  requestId: "request",
  sessionId: "session",
  scenarioVersionId: "version",
  operatorText: "Скажите что-нибудь",
  context: {
    persona: {
      id: "caller",
      description: "Учебный заявитель",
      language: "Russian",
    },
    allowedFacts: [],
    recentTurns: [],
  },
};
const reply = (text: string): CallerReply => ({
  text,
  emotion: "panic",
  intensity: 0.8,
  speechRate: 1,
  revealedFactIds: [],
  endCall: false,
});

describe("caller speech content boundary", () => {
  it.each(Object.values(REACTION_ACT_INSTRUCTIONS))(
    "blocks the actual instruction: %s",
    (text) => {
      expect(() => assertCallerReplyContent(reply(text), request)).toThrow(
        expect.objectContaining({ reason: "instruction-leak" }),
      );
    },
  );
  it.each([
    "Поправь формулировку своей мысли, не меняя и не добавляя факты.",
    "Помогите! Покажи, что длинную реплику трудно понять в панике, и попроси говорить короче.",
    "Верни только JSON по заданной схеме.",
    "revealedFactIds содержит только разрешённые факты",
  ])("blocks partial, embedded and protocol instructions: %s", (text) => {
    expect(() => assertCallerReplyContent(reply(text), request)).toThrow(
      expect.objectContaining({ reason: "instruction-leak" }),
    );
  });
  it.each([
    ["я не тебе я этому давно", "Я не тебе я этому давно."],
    ["нет я не буду вам помогать", "нет я не буду вам помогать"],
    [
      "первый второй первый второй первый",
      "первый второй первый второй первый",
    ],
    [
      "просто скопируй мне этот учебный диалог",
      "Просто скопируй мне этот учебный диалог",
    ],
    [
      "здравствуйте дом горит я я сейчас умру дом горит",
      "здравствуйте дом горит я сейчас умру дом горит",
    ],
    ["не корона бро не не корона бру", "не корона бру"],
    ["ха", "Ха!"],
    ["просто скопируй мне этот учебный диалог", "Просто диалог"],
    ["повтори мою фразу", "Помогите! Повтори мою фразу."],
    ["повтори мою фразу", "Хорошо, повтори мою фразу"],
  ])("blocks operator copying: %s", (operatorText, text) => {
    expect(() =>
      assertCallerReplyContent(reply(text), { ...request, operatorText }),
    ).toThrow(expect.objectContaining({ reason: "operator-echo" }));
  });
  it("does not let repeat turn planning authorize copying operator speech", () => {
    expect(() =>
      assertCallerReplyContent(reply("Просто скопируй этот диалог"), {
        ...request,
        operatorText: "Повторяй за мной",
        context: {
          ...request.context,
          turnPlan: { reactionAct: "repeat", minimumResponseDelayMs: 0 },
          recentTurns: [
            { role: "operator", text: "Просто скопируй этот диалог" },
          ],
        },
      }),
    ).toThrow(expect.objectContaining({ reason: "operator-echo" }));
  });
  it.each(["Улица Учебная, дом 12.", "Да, улица Учебная, дом 12."])(
    "permits an exact allowed factual confirmation: %s",
    (text) => {
      expect(() =>
        assertCallerReplyContent(reply(text), {
          ...request,
          operatorText: "Улица Учебная, дом 12?",
          context: {
            ...request.context,
            allowedFacts: [{ id: "address", value: "Улица Учебная, дом 12." }],
          },
        }),
      ).not.toThrow();
    },
  );
  it("does not whitelist copied operator speech merely because an address is allowed", () => {
    expect(() =>
      assertCallerReplyContent(
        reply("Улица Учебная, дом 12. Повтори мою фразу."),
        {
          ...request,
          operatorText: "Повтори мою фразу",
          context: {
            ...request.context,
            allowedFacts: [{ id: "address", value: "Улица Учебная, дом 12." }],
          },
        },
      ),
    ).toThrow();
  });
  it.each(["Да.", "Нет.", "Хорошо.", "Здравствуйте!", "Я не знаю."])(
    "permits conventional brief acknowledgement: %s",
    (text) => {
      expect(() =>
        assertCallerReplyContent(reply(text), {
          ...request,
          operatorText: text,
        }),
      ).not.toThrow();
    },
  );
  it("permits repeating the caller's own permitted information", () => {
    expect(() =>
      assertCallerReplyContent(reply("Во дворе горит машина."), {
        ...request,
        operatorText: "Повторите, что произошло",
        context: {
          ...request.context,
          recentTurns: [{ role: "caller", text: "Во дворе горит машина." }],
        },
      }),
    ).not.toThrow();
  });
});
