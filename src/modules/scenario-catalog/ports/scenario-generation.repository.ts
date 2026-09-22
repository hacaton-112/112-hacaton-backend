import type { ScenarioGenerationJobRecord } from "@/drizzle/schema";

export interface ClaimedScenarioGenerationJob {
  readonly job: ScenarioGenerationJobRecord;
  readonly leaseToken: string;
}

/** Очередь черновиков помощника; хранится в Postgres, а не в памяти процесса. */
export interface ScenarioGenerationRepository {
  enqueue(input: {
    readonly id: string;
    readonly createdBy: string;
    readonly brief: string;
    readonly now: Date;
  }): Promise<ScenarioGenerationJobRecord>;

  /** Задания автора в очереди и в работе — для ограничения на одного человека. */
  countActive(createdBy: string): Promise<number>;

  listByOwner(
    createdBy: string,
    limit: number,
  ): Promise<ScenarioGenerationJobRecord[]>;

  get(id: string): Promise<ScenarioGenerationJobRecord | null>;

  /** Место в очереди: сколько заданий стоят раньше, начиная с 1. */
  queuePositions(
    jobs: readonly ScenarioGenerationJobRecord[],
  ): Promise<ReadonlyMap<string, number>>;

  /**
   * Берёт самое старое задание в очереди или задание с истёкшей арендой.
   * Конкурирующие обработчики получают разные задания.
   */
  claimNext(input: {
    readonly leaseToken: string;
    readonly leaseUntil: Date;
    readonly maxAttempts: number;
    readonly now: Date;
  }): Promise<ClaimedScenarioGenerationJob | null>;

  complete(
    claimed: ClaimedScenarioGenerationJob,
    result: unknown,
    now: Date,
  ): Promise<void>;

  fail(
    claimed: ClaimedScenarioGenerationJob,
    error: { readonly code: string; readonly message: string },
    now: Date,
  ): Promise<void>;

  /** Задания, которые брали в работу слишком много раз и так и не закончили. */
  failExhausted(maxAttempts: number, now: Date): Promise<number>;

  dismiss(id: string, createdBy: string, now: Date): Promise<boolean>;
}

export const SCENARIO_GENERATION_REPOSITORY = Symbol(
  "SCENARIO_GENERATION_REPOSITORY",
);
