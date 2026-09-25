import { NestFactory } from "@nestjs/core";
import { VersioningType } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, desc, eq } from "drizzle-orm";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { FastifyInstance } from "fastify";

import { CoreModule } from "@/core/core.module";
import { createFastifyAdapter } from "@/core/http/fastify.adapter";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  scenarios,
  scenarioVersions,
  trainingGroupMembers,
  trainingGroups,
  users,
} from "@/drizzle/schema";
import {
  ScenarioSeedSchema,
  type ScenarioSeed,
} from "@/modules/scenario-engine/domain/scenario-seed.schema";

const live = process.env.RUN_E2E === "1";
const describeLive = live ? describe : describe.skip;

type JsonRecord = Record<string, unknown>;

describeLive("Этап 7: сквозные потоки на PostgreSQL", () => {
  let app: NestFastifyApplication;
  let db: DrizzleService["db"];
  let instructorToken = "";
  let operatorToken = "";
  let groupId = "";
  let operatorId = "";
  let lessonId = "";
  let scenario: ScenarioSeed;

  const request = async (
    method: "GET" | "POST",
    url: string,
    token?: string,
    payload?: unknown,
  ) => {
    const server = app.getHttpAdapter().getInstance() as FastifyInstance;
    const response = await server.inject({
      method,
      url,
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
      payload: payload as object | undefined,
    });
    let body: JsonRecord = {};
    try {
      body = response.body ? (JSON.parse(response.body) as JsonRecord) : {};
    } catch {
      // Файловые маршруты намеренно возвращают не JSON; для них проверяется
      // сырой буфер и заголовки, а не искусственно декодированное тело.
    }
    return {
      status: response.statusCode,
      headers: response.headers,
      body,
      raw: response.rawPayload,
    };
  };

  beforeAll(async () => {
    const seed = ScenarioSeedSchema.parse(
      JSON.parse(
        await readFile(
          join(
            process.cwd(),
            "drizzle",
            "seed",
            "scenarios",
            "s-015-fire-apartment.json",
          ),
          "utf8",
        ),
      ),
    );
    const suffix = `${Date.now()}`.slice(-8);
    scenario = {
      ...seed,
      code: `E2E-${suffix}`,
      title: `E2E перенос сценария ${suffix}`,
      persona: { ...seed.persona, code: `E2E-PERSONA-${suffix}` },
    };

    const adapter = createFastifyAdapter();
    app = await NestFactory.create<NestFastifyApplication>(
      CoreModule,
      adapter,
      {
        logger: false,
      },
    );
    app.setGlobalPrefix("api");
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    db = app.get<DrizzleService["db"]>(DRIZZLE);

    const [member] = await db
      .select({
        groupId: trainingGroups.id,
        operatorId: users.id,
        operatorEmail: users.email,
      })
      .from(trainingGroupMembers)
      .innerJoin(
        trainingGroups,
        eq(trainingGroups.id, trainingGroupMembers.groupId),
      )
      .innerJoin(users, eq(users.id, trainingGroupMembers.userId))
      .where(
        and(
          eq(trainingGroups.code, "SIP-413"),
          eq(trainingGroupMembers.serviceTag, "01"),
        ),
      )
      .limit(1);
    if (!member)
      throw new Error("Для e2e не засеян участник SIP-413 со службой 01");
    groupId = member.groupId;
    operatorId = member.operatorId;

    const instructor = await request("POST", "/api/v1/auth/login", undefined, {
      email: "instructor@system112.local",
      password: "System112Instructor2026!",
    });
    const operator = await request("POST", "/api/v1/auth/login", undefined, {
      email: member.operatorEmail,
      password: "System112Operator2026!",
    });
    instructorToken = String(instructor.body.accessToken ?? "");
    operatorToken = String(operator.body.accessToken ?? "");
  });

  afterAll(async () => {
    await app?.close();
  });

  it("входит под преподавателем и обучающимся", () => {
    expect(instructorToken).not.toHaveLength(0);
    expect(operatorToken).not.toHaveLength(0);
  });

  it("проверяет пакет и создаёт сценарий только после подтверждения", async () => {
    const packageData = {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      scenarios: [scenario],
    };
    const dryRun = await request(
      "POST",
      "/api/v1/scenarios/import",
      instructorToken,
      {
        ...packageData,
        dryRun: true,
      },
    );
    expect(dryRun.status).toBe(201);
    expect(dryRun.body).toMatchObject({
      dryRun: true,
      accepted: 1,
      rejected: 0,
    });
    expect(
      await db
        .select()
        .from(scenarios)
        .where(eq(scenarios.code, scenario.code)),
    ).toHaveLength(0);

    const imported = await request(
      "POST",
      "/api/v1/scenarios/import",
      instructorToken,
      {
        ...packageData,
        dryRun: false,
      },
    );
    expect(imported.status).toBe(201);
    expect(imported.body).toMatchObject({
      dryRun: false,
      accepted: 1,
      rejected: 0,
    });
  });

  it("выгружает переносимый пакет без внутренних идентификаторов", async () => {
    const [version] = await db
      .select({ id: scenarioVersions.id })
      .from(scenarioVersions)
      .innerJoin(scenarios, eq(scenarios.id, scenarioVersions.scenarioId))
      .where(eq(scenarios.code, scenario.code))
      .orderBy(desc(scenarioVersions.version))
      .limit(1);
    const exported = await request(
      "GET",
      `/api/v1/scenarios/export?ids=${version.id}`,
      instructorToken,
    );
    expect(exported.status).toBe(200);
    expect(exported.headers["content-disposition"]).toContain("attachment");
    expect(exported.body.scenarios).toEqual([scenario]);
    expect(JSON.stringify(exported.body)).not.toContain(operatorId);
  });

  it("проводит занятие ДДС от выдачи карточки до завершения", async () => {
    const created = await request(
      "POST",
      "/api/v1/dds-lessons",
      instructorToken,
      {
        eventId: crypto.randomUUID(),
        groupId,
        title: "E2E занятие ДДС",
        categories: ["fire"],
        cardSource: "generated",
        acknowledgementNormSeconds: 30,
        passThreshold: 75,
      },
    );
    expect(created.status).toBe(201);
    lessonId = String(created.body.id);

    const next = await request(
      "POST",
      `/api/v1/dds-lessons/${lessonId}/next`,
      operatorToken,
      { eventId: crypto.randomUUID() },
    );
    expect(next.status).toBe(200);
    expect(next.body.status).toBe("ready");

    const finished = await request(
      "POST",
      `/api/v1/dds-lessons/${lessonId}/finish`,
      instructorToken,
      { eventId: crypto.randomUUID() },
    );
    expect(finished.status).toBe(200);
    expect(finished.body.status).toBe("finished");
  });

  it("собирает отчёт по завершённому занятию", async () => {
    const report = await request(
      "GET",
      `/api/v1/dds/lessons/${lessonId}/report`,
      instructorToken,
    );
    expect(report.status).toBe(200);
    expect(report.body.lesson).toMatchObject({
      id: lessonId,
      status: "finished",
    });
    expect(report.body.cards).toHaveLength(1);
  });

  it("выгружает отчёт обычным файлом", async () => {
    const exported = await request(
      "GET",
      `/api/v1/dds/lessons/${lessonId}/report/export?format=csv`,
      instructorToken,
    );
    expect(exported.status).toBe(200);
    expect(exported.headers["content-disposition"]).toContain("attachment");
    expect(exported.raw.byteLength).toBeGreaterThan(100);
  });

  it("при повторном импорте создаёт новую версию и сохраняет историю", async () => {
    const updated = {
      ...scenario,
      summary: `${scenario.summary} Проверка новой версии.`,
    };
    const imported = await request(
      "POST",
      "/api/v1/scenarios/import",
      instructorToken,
      {
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        scenarios: [updated],
        dryRun: false,
      },
    );
    expect(imported.status).toBe(201);
    expect(imported.body.entries).toEqual([
      { code: scenario.code, outcome: "updated", reason: null },
    ]);
    const versions = await db
      .select({ version: scenarioVersions.version })
      .from(scenarioVersions)
      .innerJoin(scenarios, eq(scenarios.id, scenarioVersions.scenarioId))
      .where(eq(scenarios.code, scenario.code));
    expect(versions.map(({ version }) => version).sort()).toEqual([1, 2]);
  });
});
