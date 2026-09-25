import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";

import { generateId } from "@/common/utils/id";

import type { ScenarioStore } from "../ports/scenario-store.port";
import { SCENARIO_STORE } from "../scenario-engine.tokens";

import { ScenarioEngineService } from "./scenario-engine.service";

/**
 * Через сколько бездействия звонок считается брошенным.
 *
 * Учебный вызов идёт минуты, и полчаса тишины означают, что за ним никого нет.
 * Порог не в настройках: это не то, что преподаватель крутит от занятия к
 * занятию.
 */
const IDLE_MINUTES = 30;
const SWEEP_INTERVAL_MS = 5 * 60 * 1_000;
const MAX_PER_SWEEP = 50;
const MILLISECONDS_PER_MINUTE = 60_000;

/**
 * Закрывает звонки, за которыми никого не осталось.
 *
 * Обрыв соединения завершает звонок сам, но процесс backend может упасть между
 * репликами — тогда звонок остаётся в разговоре навсегда: без длительности, без
 * оценки и с карточкой, открытой на запись. Уборка страхует именно этот случай
 * и заодно закрывает то, что накопилось до появления этой страховки.
 */
@Injectable()
export class AbandonedCallJanitor implements OnModuleInit {
  private readonly logger = new Logger(AbandonedCallJanitor.name);

  constructor(
    @Inject(SCENARIO_STORE) private readonly store: ScenarioStore,
    private readonly engine: ScenarioEngineService,
  ) {}

  onModuleInit(): void {
    void this.sweep();

    // unref: уборка не должна держать процесс живым при остановке.
    setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS).unref();
  }

  async sweep(now: Date = new Date()): Promise<number> {
    const idleSince = new Date(
      now.getTime() - IDLE_MINUTES * MILLISECONDS_PER_MINUTE,
    );
    let closed = 0;

    try {
      const abandoned = await this.store.listAbandonedCalls(
        idleSince,
        MAX_PER_SWEEP,
      );

      for (const call of abandoned) {
        try {
          // Звонок закончился тогда, когда оператор пропал, а не когда уборка
          // это заметила: иначе брошенный вчера вызов получает в разборе
          // длительность в сутки.
          //
          // Предложенный вызов завершить нельзя: у него своё окончание —
          // отказ. Раньше уборка звала завершение для всех и на каждом проходе
          // спотыкалась об одни и те же непринятые предложения.
          if (call.stage === "offered") {
            await this.engine.declineCall({
              trainingSessionId: call.trainingSessionId,
              eventId: generateId(),
              now: call.lastActivityAt,
            });
          } else {
            await this.engine.endCall({
              trainingSessionId: call.trainingSessionId,
              eventId: generateId(),
              reason: "abandoned",
              now: call.lastActivityAt,
            });
          }
          closed += 1;
        } catch (error) {
          // Один непослушный звонок не должен останавливать уборку.
          this.logger.warn(
            `Could not close the abandoned call ${call.trainingSessionId}: ${
              error instanceof Error ? error.message : "unknown error"
            }`,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `Could not look for abandoned calls: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }

    if (closed > 0) {
      this.logger.log(`Closed ${closed} abandoned calls`);
    }

    return closed;
  }
}
