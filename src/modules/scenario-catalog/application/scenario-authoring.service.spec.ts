import { ErrorCodes } from "@/contracts";

import { validAssistantSuggestion } from "../domain/scenario-assistant-suggestion.fixture";
import { GrammarService } from "@/modules/grammar";

import { ScenarioAuthoringService } from "./scenario-authoring.service";
import {
  type EditableScenarioVersion,
  ScenarioAuthoringConflictError,
  type ScenarioAuthoringRepository,
  ScenarioNotFoundError,
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
  const loadVersion = jest.fn().mockResolvedValue(null);
  const publishVersion = jest
    .fn()
    .mockResolvedValue({ ...publication, version: 2 });
  const archive = jest.fn().mockResolvedValue("archived");

  return {
    service: new ScenarioAuthoringService(
      { generate } as ScenarioDraftAssistantPort,
      {
        publish,
        loadVersion,
        publishVersion,
        archive,
      } as ScenarioAuthoringRepository,
      new GrammarService(),
    ),
    generate,
    publish,
    loadVersion,
    publishVersion,
    archive,
  };
};

const editRequest = {
  baseVersionId: "scenario-version-1",
  scenario: {} as never,
  authoringSource: "manual" as const,
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

  it("retries a draft whose scripted line is spoken by the operator", async () => {
    const operatorDraft = validAssistantSuggestion();
    operatorDraft.openingLine = "Здравствуйте, служба 112, что случилось?";
    const { service, generate } = createService([
      operatorDraft,
      validAssistantSuggestion(),
    ]);

    await expect(
      service.generateDraft("Учебное ДТП во дворе с одним пострадавшим"),
    ).resolves.toBeDefined();

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].validationFeedback).toContain(
      "openingLine",
    );
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

  it("hands over a published version for editing", async () => {
    const { service, loadVersion } = createService([]);
    const version = {
      scenarioId: "scenario-1",
      scenarioVersionId: "scenario-version-1",
      version: 1,
      isLatest: true,
      publishedAt: "2026-09-13T00:00:00.000Z",
      authoringSource: "manual",
      scenario: {} as never,
      issues: [],
    } satisfies EditableScenarioVersion;
    loadVersion.mockResolvedValueOnce(version);

    await expect(service.loadVersion("scenario-version-1")).resolves.toBe(
      version,
    );
  });

  it("says a missing or unpublished version does not exist", async () => {
    const { service } = createService([]);

    await expect(service.loadVersion("missing")).rejects.toMatchObject({
      code: ErrorCodes.SCENARIO_VERSION_NOT_FOUND,
    });
  });

  it("publishes an edit on top of the version the instructor opened", async () => {
    const { service, publishVersion } = createService([]);

    await expect(
      service.publishVersion("scenario-1", editRequest, "instructor-1"),
    ).resolves.toMatchObject({ version: 2 });
    expect(publishVersion).toHaveBeenCalledWith({
      scenarioId: "scenario-1",
      baseVersionId: "scenario-version-1",
      scenario: editRequest.scenario,
      authorId: "instructor-1",
      authoringSource: "manual",
      authoringPrompt: undefined,
    });
  });

  it.each([
    ["stale-version", ErrorCodes.SCENARIO_VERSION_STALE],
    ["code-changed", ErrorCodes.SCENARIO_CODE_IMMUTABLE],
    ["persona-code", ErrorCodes.SCENARIO_PERSONA_CODE_EXISTS],
  ] as const)(
    "reports a %s edit as a conflict the editor can explain",
    async (conflict, code) => {
      const { service, publishVersion } = createService([]);
      publishVersion.mockRejectedValueOnce(
        new ScenarioAuthoringConflictError(conflict),
      );

      await expect(
        service.publishVersion("scenario-1", editRequest, "instructor-1"),
      ).rejects.toMatchObject({ code, status: 409 });
    },
  );

  it("reports an edit of a scenario that does not exist", async () => {
    const { service, publishVersion } = createService([]);
    publishVersion.mockRejectedValueOnce(new ScenarioNotFoundError());

    await expect(
      service.publishVersion("missing", editRequest, "instructor-1"),
    ).rejects.toMatchObject({
      code: ErrorCodes.SCENARIO_NOT_FOUND,
      status: 404,
    });
  });

  it("does not disguise an unexpected failure as a conflict", async () => {
    const { service, publishVersion } = createService([]);
    const failure = new Error("connection reset");
    publishVersion.mockRejectedValueOnce(failure);

    await expect(
      service.publishVersion("scenario-1", editRequest, "instructor-1"),
    ).rejects.toBe(failure);
  });

  it("removes a scenario from the catalog on behalf of the instructor", async () => {
    const { service, archive } = createService([]);

    await expect(
      service.archive("scenario-1", "instructor-1"),
    ).resolves.toBeUndefined();
    expect(archive).toHaveBeenCalledWith({
      scenarioId: "scenario-1",
      actorId: "instructor-1",
    });
  });

  it("treats a repeated removal as done", async () => {
    const { service, archive } = createService([]);
    archive.mockResolvedValueOnce("already-archived");

    await expect(
      service.archive("scenario-1", "instructor-1"),
    ).resolves.toBeUndefined();
  });

  it("reports the removal of a scenario that does not exist", async () => {
    const { service, archive } = createService([]);
    archive.mockRejectedValueOnce(new ScenarioNotFoundError());

    await expect(
      service.archive("missing", "instructor-1"),
    ).rejects.toMatchObject({
      code: ErrorCodes.SCENARIO_NOT_FOUND,
      status: 404,
    });
  });

  it("checks the texts of a draft the instructor is still editing", async () => {
    const { service } = createService([]);

    const report = await service.checkGrammar({
      version: { openingLine: "Горит квартирa!" },
      facts: [{ key: "incident_type", promptValue: "Горит  крыша." }],
    });

    // Проверка читает черновик как есть и ничего не сохраняет.
    expect(
      report.fields.map((field) => [field.id, field.issues.length]),
    ).toEqual([
      ["version.openingLine", 1],
      ["facts.0.promptValue", 1],
    ]);
    expect(report).toMatchObject({ errorCount: 1, styleCount: 1 });
  });
});
