import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { inArray, lt } from "drizzle-orm";

import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import { auditLog } from "@/drizzle/schema";

import { hasMoreToDelete, retentionCutoff } from "./domain/retention";
import {
  AUDIT_LOG_RETENTION,
  type AuditLogRetentionSettings,
} from "./audit-log.tokens";

/** Партия за раз: уборка не должна держать долгую блокировку на таблице. */
const BATCH_SIZE = 500;
/** Страховка от бесконечного цикла, если удаление вдруг перестанет работать. */
const MAX_BATCHES_PER_SWEEP = 200;
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1_000;

/**
 * Чистит журнал аудита по сроку хранения.
 *
 * Журнал пополняется при каждом значимом действии и сам по себе не
 * заканчивается. Хранить его вечно незачем: разбор занятия опирается на записи
 * последних месяцев, а персональные данные обучающихся не должны лежать
 * дольше, чем нужно. Срок задаётся настройкой, уборка идёт партиями и
 * записывает в лог, сколько удалила.
 */
@Injectable()
export class AuditLogRetentionJanitor implements OnModuleInit {
  private readonly logger = new Logger(AuditLogRetentionJanitor.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService["db"],
    @Inject(AUDIT_LOG_RETENTION)
    private readonly settings: AuditLogRetentionSettings,
  ) {}

  onModuleInit(): void {
    if (!this.settings.enabled) {
      this.logger.log("Audit log retention is disabled: nothing is deleted");
      return;
    }

    void this.sweep();

    // unref: уборка не должна держать процесс живым при остановке.
    setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS).unref();
  }

  /** Удаляет записи старше срока хранения и возвращает их количество. */
  async sweep(now: Date = new Date()): Promise<number> {
    if (!this.settings.enabled) return 0;

    const cutoff = retentionCutoff(now, this.settings.retentionDays);
    let removed = 0;

    try {
      for (let batch = 0; batch < MAX_BATCHES_PER_SWEEP; batch += 1) {
        const deleted = await this.deleteBatch(cutoff);
        removed += deleted;
        if (!hasMoreToDelete(deleted, BATCH_SIZE)) break;
      }
    } catch (error) {
      // Журнал важнее уборки: неудача записывается и ждёт следующего прохода.
      this.logger.warn(
        `Could not apply audit log retention: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      return removed;
    }

    if (removed > 0) {
      this.logger.log(
        `Removed ${removed} audit log entries older than ${cutoff.toISOString()}`,
      );
    }

    return removed;
  }

  /**
   * Партия удаляется по заранее выбранным идентификаторам.
   *
   * `delete ... limit` в PostgreSQL нет, а удалять всё одним запросом нельзя:
   * накопившийся за годы журнал заблокировал бы таблицу целиком.
   */
  private async deleteBatch(cutoff: Date): Promise<number> {
    const expired = await this.db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(lt(auditLog.createdAt, cutoff))
      .limit(BATCH_SIZE);

    if (expired.length === 0) return 0;

    await this.db.delete(auditLog).where(
      inArray(
        auditLog.id,
        expired.map(({ id }) => id),
      ),
    );

    return expired.length;
  }
}
