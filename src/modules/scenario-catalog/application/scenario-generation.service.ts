import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  AppConflictException,
  AppException,
  AppNotFoundException,
} from "@/common/exceptions/app.exception";
import { generateId } from "@/common/utils/id";
import { ErrorCodes } from "@/contracts";
import { BackgroundQueueScheduler } from "@/core/background-queue/background-queue.scheduler";
import type { ScenarioGenerationJobRecord } from "@/drizzle/schema";
import type { TrainingActor } from "@/modules/training/training.service";

import type { ScenarioGenerationJob } from "../dto/scenario-generation.dto";
import {
  type ClaimedScenarioGenerationJob,
  SCENARIO_GENERATION_REPOSITORY,
  type ScenarioGenerationRepository,
} from "../ports/scenario-generation.repository";
import { ScenarioAuthoringService } from "./scenario-authoring.service";

/**
 * Сколько незаконченных заданий может держать один преподаватель.
 *
 * Очередь общая: без предела один человек, нажавший кнопку двадцать раз,
 * отодвинул бы всех остальных на полчаса.
 */
export const MAX_ACTIVE_JOBS_PER_AUTHOR = 5;
/** Сколько раз задание берётся в работу, если процесс падал посреди него. */
export const MAX_JOB_ATTEMPTS = 3;
/** Две попытки помощника по две минуты тайм-аута модели — с запасом. */
const LEASE_MS = 6 * 60_000;
const LIST_LIMIT = 30;

/**
 * Черновики помощника в фоне.
 *
 * Модель на CPU пишет черновик десяток секунд, а при нагрузке — дольше.
 * Держать ради этого HTTP-запрос нельзя: он обрывается прокси, а у
 * нескольких преподаватей сразу запросы выстраиваются в невидимую очередь.
 * Поэтому запрос только ставит задание, а обработчик берёт задания по числу
 * слотов модели — сколько бы преподавателей их ни создали.
 */
@Injectable()
export class ScenarioGenerationService implements OnModuleInit {
  private readonly logger = new Logger(ScenarioGenerationService.name);
  private running = 0;
  private ticking = false;

  constructor(
    @Inject(SCENARIO_GENERATION_REPOSITORY)
    private readonly jobs: ScenarioGenerationRepository,
    private readonly authoring: ScenarioAuthoringService,
    private readonly config: ConfigService,
    @Optional() private readonly scheduler?: BackgroundQueueScheduler,
  ) {}

  /** Одновременно — столько, сколько слотов у модели для не-диалоговых задач. */
  private get concurrency(): number {
    const value = Number(
      this.config.get("SCENARIO_GENERATION_CONCURRENCY") ??
        this.config.get("TOOLS_LLM_CONCURRENCY") ??
        1,
    );
    return Number.isInteger(value) && value > 0 ? Math.min(value, 4) : 1;
  }

  private get workerEnabled(): boolean {
    return (
      String(
        this.config.get("SCENARIO_GENERATION_WORKER_ENABLED") ?? "true",
      ) !== "false"
    );
  }

  onModuleInit(): void {
    this.scheduler?.register({
      name: "scenario_generation",
      enabled: () => this.workerEnabled,
      run: () => this.tick(),
    });
  }

  async enqueue(
    actor: TrainingActor,
    brief: string,
  ): Promise<ScenarioGenerationJob> {
    if ((await this.jobs.countActive(actor.id)) >= MAX_ACTIVE_JOBS_PER_AUTHOR) {
      throw new AppConflictException(
        ErrorCodes.SCENARIO_GENERATION_LIMIT,
        `Одновременно можно готовить не больше ${MAX_ACTIVE_JOBS_PER_AUTHOR} черновиков`,
      );
    }
    const job = await this.jobs.enqueue({
      id: generateId(),
      createdBy: actor.id,
      brief: brief.trim(),
      now: new Date(),
    });
    // Не ждём таймера: свободный слот начнёт работу сразу.
    if (this.scheduler) this.scheduler.wake();
    else void this.tick();
    return this.present(job, await this.jobs.queuePositions([job]), false);
  }

  async list(actor: TrainingActor): Promise<{ jobs: ScenarioGenerationJob[] }> {
    const jobs = await this.jobs.listByOwner(actor.id, LIST_LIMIT);
    const positions = await this.jobs.queuePositions(jobs);
    return { jobs: jobs.map((job) => this.present(job, positions, false)) };
  }

  async get(actor: TrainingActor, id: string): Promise<ScenarioGenerationJob> {
    const job = await this.jobs.get(id);
    if (!job || (job.createdBy !== actor.id && actor.role !== "admin")) {
      throw new AppNotFoundException(
        ErrorCodes.SCENARIO_GENERATION_JOB_NOT_FOUND,
        "There is no scenario generation job with this id",
      );
    }
    return this.present(job, await this.jobs.queuePositions([job]), true);
  }

  async dismiss(actor: TrainingActor, id: string): Promise<void> {
    if (!(await this.jobs.dismiss(id, actor.id, new Date()))) {
      throw new AppNotFoundException(
        ErrorCodes.SCENARIO_GENERATION_JOB_NOT_FOUND,
        "There is no finished generation job with this id",
      );
    }
  }

  /** Один проход обработчика: занять свободные слоты заданиями из очереди. */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.jobs.failExhausted(MAX_JOB_ATTEMPTS, new Date());
      while (this.running < this.concurrency) {
        const now = new Date();
        const claimed = await this.jobs.claimNext({
          leaseToken: generateId(),
          leaseUntil: new Date(now.getTime() + LEASE_MS),
          maxAttempts: MAX_JOB_ATTEMPTS,
          now,
        });
        if (!claimed) break;
        this.running += 1;
        void this.process(claimed).finally(() => {
          this.running -= 1;
          // Освободившийся слот сразу берёт следующее задание.
          void this.tick();
        });
      }
    } catch (error) {
      this.logger.warn(
        `Scenario generation queue tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.ticking = false;
    }
  }

  private async process(claimed: ClaimedScenarioGenerationJob): Promise<void> {
    const started = Date.now();
    try {
      const result = await this.authoring.generateDraft(claimed.job.brief);
      await this.jobs.complete(claimed, result, new Date());
      this.logger.log(
        `Scenario draft ${claimed.job.id} ready in ${Date.now() - started} ms`,
      );
    } catch (error) {
      await this.jobs.fail(
        claimed,
        {
          code:
            error instanceof AppException
              ? error.code
              : ErrorCodes.SCENARIO_ASSISTANT_UNAVAILABLE,
          message:
            error instanceof AppException
              ? error.message
              : "Помощник временно недоступен",
        },
        new Date(),
      );
      this.logger.warn(
        `Scenario draft ${claimed.job.id} failed after ${Date.now() - started} ms: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private present(
    job: ScenarioGenerationJobRecord,
    positions: ReadonlyMap<string, number>,
    withResult: boolean,
  ): ScenarioGenerationJob {
    return {
      id: job.id,
      brief: job.brief,
      status: job.status,
      queuePosition: positions.get(job.id) ?? null,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      error:
        job.status === "failed"
          ? {
              code: job.errorCode ?? ErrorCodes.SCENARIO_ASSISTANT_UNAVAILABLE,
              message: job.errorMessage ?? "Генерация не удалась",
            }
          : null,
      result:
        withResult && job.status === "done"
          ? (job.result as ScenarioGenerationJob["result"])
          : null,
    };
  }
}
