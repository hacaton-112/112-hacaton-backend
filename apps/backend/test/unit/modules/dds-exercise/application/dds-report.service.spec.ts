import { DdsReportService } from "@/modules/dds-exercise/application/dds-report.service";

const createDb = (results: unknown[]) => {
  const next = () => {
    if (results.length === 0) throw new Error("Unexpected query");
    return Promise.resolve(results.shift());
  };
  const chain: object = new Proxy(
    {},
    {
      get: (_target, method: string) => {
        if (method === "then") {
          return (
            resolve: (value: unknown) => void,
            reject: (error: unknown) => void,
          ) => next().then(resolve, reject);
        }
        return () => chain;
      },
    },
  );
  return new Proxy(
    {},
    {
      get: () => () => chain,
    },
  );
};

describe(DdsReportService.name, () => {
  it("shows a completed assigned DDS card in the operator results", async () => {
    const createdAt = new Date("2026-09-27T10:00:00.000Z");
    const completedAt = new Date("2026-09-27T10:02:00.000Z");
    const exercise = {
      id: "11111111-1111-4111-8111-111111111111",
      operatorId: "22222222-2222-4222-8222-222222222222",
      scenarioVersionId: "33333333-3333-4333-8333-333333333333",
      lessonId: null,
      trainingAttemptId: "44444444-4444-4444-8444-444444444444",
      createdAt,
      completedAt,
      acknowledgementDeadlineAt: new Date("2026-09-27T10:00:45.000Z"),
      status: "completed",
      score: 82,
      passThreshold: 75,
    };
    const assignment = {
      id: "55555555-5555-4555-8555-555555555555",
      title: "Передача карточки в службу 03",
      answerNormSeconds: 45,
    };
    const db = createDb([
      [{ exercise, lesson: null, assignment }],
      [
        {
          exercise,
          operatorName: "Учебный оператор",
          scenarioCode: "DDS-03",
          scenarioTitle: "Вызов скорой помощи",
        },
      ],
      [],
      [],
      [],
      [],
    ]);
    const service = new DdsReportService(db as never);

    const result = await service.myResults(exercise.operatorId);

    expect(result.lessons).toEqual([
      expect.objectContaining({
        lessonId: assignment.id,
        title: assignment.title,
        status: "finished",
        cards: 1,
        averageScore: 82,
        attempts: [
          expect.objectContaining({
            exerciseId: exercise.id,
            finalStatus: "completed",
            finalScore: 82,
          }),
        ],
      }),
    ]);
  });
});
