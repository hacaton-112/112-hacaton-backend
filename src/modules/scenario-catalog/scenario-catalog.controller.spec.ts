import { HttpStatus } from "@nestjs/common";
import { GUARDS_METADATA, HTTP_CODE_METADATA } from "@nestjs/common/constants";

import { JwtAuthGuard } from "@/modules/auth/jwt-auth.guard";
import { ROLES_METADATA_KEY } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";
import type { TrainingService } from "@/modules/training/training.service";

import type { ScenarioAuthoringService } from "./application/scenario-authoring.service";
import type { ScenarioCatalog } from "./ports/scenario-catalog.port";
import { ScenarioCatalogController } from "./scenario-catalog.controller";

const rolesOf = (handler: keyof ScenarioCatalogController): unknown =>
  Reflect.getMetadata(
    ROLES_METADATA_KEY,
    ScenarioCatalogController.prototype[handler],
  );

const createController = () => {
  const authoring = {
    loadVersion: jest.fn().mockResolvedValue({ scenarioVersionId: "v1" }),
    publishVersion: jest.fn().mockResolvedValue({ version: 2 }),
    archive: jest.fn().mockResolvedValue(undefined),
    checkGrammar: jest.fn().mockResolvedValue({
      fields: [],
      errorCount: 0,
      styleCount: 0,
      reviewedByModel: false,
    }),
  };
  const catalog = { listPublished: jest.fn().mockResolvedValue([]) };
  const training = {
    listScenarioVersionIdsForOperator: jest.fn().mockResolvedValue([]),
  };

  return {
    controller: new ScenarioCatalogController(
      catalog as ScenarioCatalog,
      authoring as unknown as ScenarioAuthoringService,
      training as unknown as TrainingService,
    ),
    authoring,
  };
};

describe(ScenarioCatalogController.name, () => {
  it("authenticates every route and checks roles where they are declared", () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ScenarioCatalogController),
    ).toEqual([JwtAuthGuard, RolesGuard]);
  });

  it("lets any signed-in user see what can be trained", () => {
    expect(rolesOf("list")).toBeUndefined();
  });

  it.each([
    "loadVersion",
    "publishVersion",
    "publish",
    "generateDraft",
  ] as const)("keeps %s to instructors and admins", (handler) => {
    // Оператор, увидевший факты и эталон до звонка, перестаёт их выяснять.
    expect(rolesOf(handler)).toEqual(["instructor", "admin"]);
  });

  it("opens the version that was asked for", async () => {
    const { controller, authoring } = createController();

    await controller.loadVersion("v1");

    expect(authoring.loadVersion).toHaveBeenCalledWith("v1");
  });

  it("publishes an edit on behalf of the signed-in instructor", async () => {
    const { controller, authoring } = createController();
    const body = {
      baseVersionId: "v1",
      scenario: {},
      authoringSource: "manual",
    };

    await controller.publishVersion(
      "scenario-1",
      body as never,
      {
        user: { sub: "instructor-1", role: "instructor" },
      } as never,
    );

    expect(authoring.publishVersion).toHaveBeenCalledWith(
      "scenario-1",
      body,
      "instructor-1",
    );
  });

  it("removes a scenario on behalf of the signed-in instructor and answers 204", async () => {
    const { controller, authoring } = createController();

    await controller.archive("scenario-1", {
      user: { sub: "instructor-1", role: "instructor" },
    } as never);

    expect(authoring.archive).toHaveBeenCalledWith(
      "scenario-1",
      "instructor-1",
    );
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        ScenarioCatalogController.prototype.archive,
      ),
    ).toBe(HttpStatus.NO_CONTENT);
  });

  const replyStub = () => {
    let closeListener: (() => void) | undefined;
    const raw = {
      writableEnded: false,
      once: jest.fn((_event: string, listener: () => void) => {
        closeListener = listener;
      }),
    };

    return { reply: { raw }, raw, close: () => closeListener?.() };
  };

  it("checks the grammar of a draft without saving anything", async () => {
    const { controller, authoring } = createController();
    const scenario = { version: { openingLine: "Горит квартира!" } };
    const { reply, raw } = replyStub();

    await controller.checkGrammar(reply as never, {
      scenario,
      deepReview: true,
    } as never);

    // Проверка идёт с сигналом ответа: ушёл преподаватель — ушла и модель.
    expect(authoring.checkGrammar).toHaveBeenCalledWith(
      scenario,
      true,
      expect.any(AbortSignal),
    );
    expect(raw.once).toHaveBeenCalledWith("close", expect.any(Function));
    expect(authoring.publishVersion).not.toHaveBeenCalled();
  });

  it("aborts the grammar check when the client leaves before the answer", async () => {
    const { controller, authoring } = createController();
    const { reply, close } = replyStub();

    await controller.checkGrammar(reply as never, {
      scenario: {},
      deepReview: true,
    } as never);

    const signal = authoring.checkGrammar.mock.calls[0]?.[2] as AbortSignal;
    expect(signal.aborted).toBe(false);

    close();

    expect(signal.aborted).toBe(true);
  });

  it("keeps the grammar check when the answer has been sent", async () => {
    const { controller, authoring } = createController();
    const { reply, raw, close } = replyStub();

    await controller.checkGrammar(reply as never, {
      scenario: {},
      deepReview: true,
    } as never);

    const signal = authoring.checkGrammar.mock.calls[0]?.[2] as AbortSignal;
    raw.writableEnded = true;
    close();

    expect(signal.aborted).toBe(false);
  });
});
