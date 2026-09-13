import { ErrorCodes } from "@/contracts";

import { validAssistantSuggestion } from "../domain/scenario-assistant-suggestion.fixture";
import { ScenarioAuthoringService } from "./scenario-authoring.service";
import {
  ScenarioAuthoringConflictError,
  type ScenarioAuthoringRepository,
} from "../ports/scenario-authoring.repository";
import type { ScenarioDraftAssistantPort } from "../ports/scenario-draft-assistant.port";

const publication = {
  scenarioId: "scenario-1",
  scenarioVersionId: "scenario-version-1",
  code: "S-NEW",
  title: "Учебный сценарий",
  version: 1,
  status: "published" as const,
  publishedAt: "2026-09-13T00:00:00.000Z",
};

const createService = (responses: unknown[]) => {
  const generate = jest.fn().mockImplementation(() => {
    const response = responses.shift();

    return response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve(response);
  });
  const publish = jest.fn().mockResolvedValue(publication);

  return {
    service: new ScenarioAuthoringService(
      { generate } as ScenarioDraftAssistantPort,
      { publish } as ScenarioAuthoringRepository,
    ),
    generate,
    publish,
  };
};

describe(ScenarioAuthoringService.name, () => {
  it("retries one invalid assistant draft and never persists it", async () => {
    const { service, generate, publish } = createService([
      { title: "incomplete" },
      validAssistantSuggestion(),
    ]);

    const result = await service.generateDraft(
      "Учебный пожар в мастерской с одним пострадавшим",
    );

    expect(result.scenario.code).toMatch(/^S-AI-[A-F0-9]{8}$/);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].validationFeedback).toContain("persona");
    expect(publish).not.toHaveBeenCalled();
  });

  it("returns a stable error when both assistant drafts are invalid", async () => {
    const { service } = createService([
      { title: "incomplete" },
      { title: "still incomplete" },
    ]);

    await expect(
      service.generateDraft("Учебная ситуация с достаточным описанием"),
    ).rejects.toMatchObject({
      code: ErrorCodes.SCENARIO_ASSISTANT_INVALID_DRAFT,
    });
  });

  it("maps a duplicate scenario code to a public conflict", async () => {
    const { service, publish } = createService([]);
    publish.mockRejectedValueOnce(
      new ScenarioAuthoringConflictError("scenario-code"),
    );

    await expect(
      service.publish(
        {
          scenario: {} as never,
          authoringSource: "manual",
        },
        "instructor-1",
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.SCENARIO_CODE_EXISTS });
  });
});
