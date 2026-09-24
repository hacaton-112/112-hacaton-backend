import type { DrizzleService } from "@/core/database/drizzle.service";
import { ddsExercises } from "@/drizzle/schema";

import { DdsArchiveService } from "./dds-archive.service";

jest.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ and: conditions }),
  or: (...conditions: unknown[]) => ({ or: conditions }),
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
  gte: (column: unknown, value: unknown) => ({ gte: [column, value] }),
  lt: (column: unknown, value: unknown) => ({ lt: [column, value] }),
  isNull: (column: unknown) => ({ isNull: column }),
  count: () => ({ count: true }),
  desc: (column: unknown) => ({ desc: column }),
  sql: (parts: TemplateStringsArray, ...values: unknown[]) => ({
    text: parts.join("?"),
    values,
  }),
}));

const card = {
  scenarioCode: "SC-014",
  title: "Пожар в квартире",
  summary: "Горит кухня на пятом этаже",
  category: "fire",
  addressText: "Москва, Тверская улица, д. 12",
  latitude: 55.75,
  longitude: 37.61,
  callerName: "Пётр Смирнов",
  callerPhone: "+79990000000",
  incidentType: "Пожар в жилом помещении",
  description: "Задымление в подъезде",
  victimsTotal: 0,
  services: ["dds_01"],
};

const row = {
  id: "exercise-1",
  createdAt: new Date("2026-09-20T08:00:00.000Z"),
  completedAt: new Date("2026-09-20T08:12:00.000Z"),
  status: "completed",
  addressedService: "dds_01",
  score: 88,
  passed: true,
  card,
  operatorId: "operator-1",
  operatorName: "Смирнов П.П.",
  lessonId: "lesson-1",
  lessonTitle: "Пожары, 20 сентября",
};

/** Запоминает условие и страницу, с которыми сервис пришёл в базу. */
const fakeDatabase = (rows: unknown[], total = rows.length) => {
  const calls: { where?: unknown; limit?: number; offset?: number }[] = [];

  const builder = (result: unknown[]) => {
    const state: { where?: unknown; limit?: number; offset?: number } = {};
    calls.push(state);

    const query = {
      from: () => query,
      leftJoin: () => query,
      where: (condition: unknown) => {
        state.where = condition;
        return query;
      },
      orderBy: () => query,
      limit: (value: number) => {
        state.limit = value;
        return query;
      },
      offset: (value: number) => {
        state.offset = value;
        return query;
      },
      then: (resolve: (value: unknown[]) => unknown) => resolve(result),
    };

    return query;
  };

  // Сервис на каждый поиск делает два запроса: страницу и общее количество.
  let issued = 0;
  const db = {
    select: () => {
      const result = issued % 2 === 0 ? rows : [{ total }];
      issued += 1;
      return builder(result);
    },
  } as unknown as DrizzleService["db"];

  return { db, calls };
};

const query = {
  limit: 20,
  offset: 0,
} as Parameters<DdsArchiveService["search"]>[1];

describe(DdsArchiveService.name, () => {
  it("превращает строку архива в карточку списка", async () => {
    const { db } = fakeDatabase([row], 137);
    const archive = new DdsArchiveService(db);

    const page = await archive.search(
      { id: "operator-1", role: "operator" },
      query,
    );

    expect(page.total).toBe(137);
    expect(page.items).toEqual([
      {
        id: "exercise-1",
        createdAt: "2026-09-20T08:00:00.000Z",
        completedAt: "2026-09-20T08:12:00.000Z",
        status: "completed",
        addressedService: "dds_01",
        score: 88,
        passed: true,
        operator: { id: "operator-1", fullName: "Смирнов П.П." },
        lesson: { id: "lesson-1", title: "Пожары, 20 сентября" },
        scenarioCode: "SC-014",
        title: "Пожар в квартире",
        category: "fire",
        incidentType: "Пожар в жилом помещении",
        addressText: "Москва, Тверская улица, д. 12",
      },
    ]);
  });

  it("обучающемуся показывает только его карточки, чужой запрос игнорирует", async () => {
    const { db, calls } = fakeDatabase([]);
    const archive = new DdsArchiveService(db);

    await archive.search({ id: "me", role: "operator" }, {
      ...query,
      operatorId: "6f7c0d5a-0f0e-4a3e-9f0b-2a1d3c4b5e6f",
    } as typeof query);

    expect(calls[0]?.where).toMatchObject({
      and: expect.arrayContaining([
        { eq: [ddsExercises.operatorId, "me"] },
      ]),
    });
  });

  it("преподавателю отдаёт архив целиком и сужает его до обучающегося", async () => {
    const { db, calls } = fakeDatabase([]);
    const archive = new DdsArchiveService(db);

    await archive.search({ id: "teacher", role: "instructor" }, query);
    await archive.search({ id: "teacher", role: "instructor" }, {
      ...query,
      operatorId: "student-1",
    } as typeof query);

    expect(calls[0]?.where).toBeUndefined();
    expect(calls[2]?.where).toMatchObject({
      and: [{ eq: [ddsExercises.operatorId, "student-1"] }],
    });
  });

  it("передаёт страницу в запрос без изменений", async () => {
    const { db, calls } = fakeDatabase([]);
    const archive = new DdsArchiveService(db);

    await archive.search({ id: "teacher", role: "admin" }, {
      ...query,
      limit: 50,
      offset: 100,
    } as typeof query);

    expect(calls[0]).toMatchObject({ limit: 50, offset: 100 });
  });

  it("отклоняет период, который кончается раньше начала", async () => {
    const { db } = fakeDatabase([]);
    const archive = new DdsArchiveService(db);

    await expect(
      archive.search({ id: "teacher", role: "admin" }, {
        ...query,
        from: "2026-09-10",
        to: "2026-09-01",
      } as typeof query),
    ).rejects.toThrow("The archive period ends before it starts");
  });
});
