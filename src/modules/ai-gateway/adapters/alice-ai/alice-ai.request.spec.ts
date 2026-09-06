import { createHash } from "node:crypto";

import type { GenerateCallerReplyRequest } from "@/contracts";

import type { AliceAiConfig } from "./alice-ai.config";
import {
  ALICE_AI_SYSTEM_PROMPT,
  CALLER_REPLY_JSON_SCHEMA,
  buildAliceAiRequest,
} from "./alice-ai.request";

const config: AliceAiConfig = {
  apiKey: "super-secret-key",
  folderId: "folder-1",
  baseUrl: "https://ai.api.cloud.yandex.net/v1",
  model: "aliceai-llm-flash",
  requestTimeoutMs: 5_000,
};

const request: GenerateCallerReplyRequest = {
  requestId: "request-1",
  sessionId: "session-1",
  scenarioVersionId: "scenario-version-1",
  operatorText: "Назовите адрес происшествия.",
  context: {
    persona: {
      id: "caller-1",
      description: "Взрослый заявитель в состоянии паники",
      language: "Russian",
    },
    allowedFacts: [
      { id: "fire_location", value: "Возгорание находится на кухне" },
    ],
    recentTurns: [
      { role: "operator", text: "Служба 112, что у вас случилось?" },
    ],
  },
};

describe(buildAliceAiRequest.name, () => {
  it("builds a deterministic structured streaming request", () => {
    const result = buildAliceAiRequest(request, config);

    expect(result).toEqual({
      model: "gpt://folder-1/aliceai-llm-flash",
      messages: [
        { role: "system", content: ALICE_AI_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            persona: request.context.persona,
            allowedFacts: request.context.allowedFacts,
            recentTurns: request.context.recentTurns,
            operatorText: request.operatorText,
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "caller_reply",
          description: "Validated caller reply for a System-112 training call",
          schema: CALLER_REPLY_JSON_SCHEMA,
          strict: true,
        },
      },
      stream: true,
      store: false,
      n: 1,
      temperature: 0.2,
      max_completion_tokens: 256,
      safety_identifier: createHash("sha256")
        .update(request.sessionId)
        .digest("hex"),
    });
  });

  it("does not expose identifiers, credentials, or unsupported options", () => {
    const result = buildAliceAiRequest(request, config);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain(request.requestId);
    expect(serialized).not.toContain(request.sessionId);
    expect(serialized).not.toContain(request.scenarioVersionId);
    expect(serialized).not.toContain(config.apiKey);
    expect(serialized).not.toContain("reasoning_effort");
  });
});
