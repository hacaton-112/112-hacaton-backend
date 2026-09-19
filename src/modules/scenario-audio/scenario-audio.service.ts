import { createHash, randomUUID } from "node:crypto";
import { setImmediate as yieldToIO } from "node:timers/promises";
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, gt, lt, or, sql } from "drizzle-orm";

import type {
  SpeechSynthesisStreamEvent,
  TtsSynthesisRequest,
} from "@/contracts";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  callStates,
  scenarioAudioPacks,
  dialoguePreparations,
} from "@/drizzle/schema";
import { DialoguePreparationWorker } from "./dialogue-preparation.worker";
import { normalizeQuestion } from "./domain/prepared-dialogue";
import type { FactQuestion } from "@/contracts";
import type { DialogueEntry } from "@/contracts/dialogue-preparation";
import {
  RECORDING_STORAGE,
  type RecordingStorage,
} from "@/modules/call-recording/ports/recording-storage.port";
import { SCENARIO_STORE } from "@/modules/scenario-engine/scenario-engine.tokens";
import type { ScenarioStore } from "@/modules/scenario-engine/ports/scenario-store.port";
import { SpeechSynthesisService } from "@/modules/speech-synthesis";
import { AuditLogService } from "@/modules/audit-log/audit-log.service";

import {
  audioFingerprint,
  compilePreparedSpeech,
} from "./domain/prepared-dialogue";
import { parseScenarioAudioConfig } from "./scenario-audio.config";

type Pack = typeof scenarioAudioPacks.$inferSelect;
type PreparedAudio = { audio: Uint8Array<ArrayBuffer>; sampleRate: number };
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
/** Столько проверенных записей держится в памяти между репликами. */
const MAX_VERIFIED_BYTES = 32 * 1024 * 1024;
const digest = (audio: Uint8Array): string =>
  createHash("sha256").update(audio).digest("hex");

@Injectable()
export class ScenarioAudioService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScenarioAudioService.name);
  private timer?: ReturnType<typeof setInterval>;
  /**
   * Проверенные записи по ключу объекта.
   *
   * Ключ содержит sha256, то есть содержимое по нему неизменно. Поэтому
   * загрузка из хранилища и сверка хеша выполняются один раз на запись, а не
   * на каждую реплику заявителя: иначе подготовленное аудио само добавляло бы
   * ту задержку, ради снятия которой готовилось.
   */
  private readonly verified = new Map<string, PreparedAudio>();
  private verifiedBytes = 0;
  private running = false;
  private readonly shutdown = new AbortController();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService["db"],
    @Inject(SCENARIO_STORE) private readonly scenarios: ScenarioStore,
    @Inject(RECORDING_STORAGE) private readonly storage: RecordingStorage,
    private readonly synthesis: SpeechSynthesisService,
    private readonly config: ConfigService,
    private readonly audit: AuditLogService,
    @Optional() private readonly preparations?: DialoguePreparationWorker,
  ) {}

  /** Opt-in: enabling compilation may consume substantial local TTS resources. */
  private get workerEnabled(): boolean {
    return parseScenarioAudioConfig({
      SCENARIO_AUDIO_WORKER_ENABLED: this.config.get(
        "SCENARIO_AUDIO_WORKER_ENABLED",
      ),
    }).workerEnabled;
  }

  onModuleInit(): void {
    if (!this.workerEnabled) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 5_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
    this.shutdown.abort();
  }

  async status(versionId: string) {
    const version = await this.scenarios.loadVersion(versionId);
    if (!version) throw new NotFoundException("Scenario version not found");
    const [pack] = await this.db
      .select()
      .from(scenarioAudioPacks)
      .where(eq(scenarioAudioPacks.scenarioVersionId, versionId));
    return {
      scenarioVersionId: versionId,
      status: pack?.status ?? "not_prepared",
      completed: pack?.completed ?? 0,
      total: pack?.total ?? 0,
      workerEnabled: this.workerEnabled,
    };
  }

  async enqueue(versionId: string, actorId: string) {
    await this.status(versionId);
    await this.db.transaction(async (tx) => {
      await tx
        .insert(scenarioAudioPacks)
        .values({ scenarioVersionId: versionId })
        .onConflictDoNothing();
      // Retry resumes the same immutable pack; ready/preparing packs are not overwritten.
      await tx
        .update(scenarioAudioPacks)
        .set({ status: "queued", updatedAt: new Date() })
        .where(
          and(
            eq(scenarioAudioPacks.scenarioVersionId, versionId),
            eq(scenarioAudioPacks.status, "failed"),
          ),
        );
      await this.audit.log(
        {
          actorId,
          action: "scenario.audio.prepare",
          resource: "scenario_version",
          resourceId: versionId,
        },
        tx,
      );
    });
    return this.status(versionId);
  }

  /** Miss/error is optional acceleration, never a reason to end a live call. */
  async approvedEntries(sessionId: string): Promise<readonly DialogueEntry[]> {
    try {
      const call = await this.scenarios.loadCall(sessionId);
      if (!call) return [];
      const [pack] = await this.db
        .select({
          entries: scenarioAudioPacks.entries,
          status: scenarioAudioPacks.status,
        })
        .from(scenarioAudioPacks)
        .where(
          eq(scenarioAudioPacks.scenarioVersionId, call.scenarioVersionId),
        );
      return pack?.status === "ready" ? pack.entries : [];
    } catch {
      return [];
    }
  }

  resolveApprovedQuestion(
    text: string,
    facts: readonly FactQuestion[],
    entries: readonly DialogueEntry[],
  ): string[] | null {
    const normalized = normalizeQuestion(text);
    const ids = new Set(facts.map((fact) => fact.id));
    const matches = entries.filter(
      (entry) =>
        ids.has(entry.factKey) &&
        entry.questions.some(
          (question) => normalizeQuestion(question) === normalized,
        ),
    );
    return matches.length ? matches.map((entry) => entry.factKey) : null;
  }

  async lookupOpening(
    sessionId: string,
    request: TtsSynthesisRequest,
    signal: AbortSignal,
  ): Promise<PreparedAudio | null> {
    try {
      const call = await this.scenarios.loadCall(sessionId);
      return call
        ? await this.lookup(call.scenarioVersionId, request, signal)
        : null;
    } catch {
      signal.throwIfAborted();
      return null;
    }
  }

  async lookup(
    versionId: string,
    request: TtsSynthesisRequest,
    signal: AbortSignal,
  ): Promise<PreparedAudio | null> {
    signal.throwIfAborted();
    try {
      const [pack] = await this.db
        .select()
        .from(scenarioAudioPacks)
        .where(eq(scenarioAudioPacks.scenarioVersionId, versionId));
      if (pack?.status !== "ready") return null;
      const asset = pack.assets[audioFingerprint(request)];
      if (!asset || asset.bytes > MAX_AUDIO_BYTES) return null;
      const remembered = this.verified.get(asset.key);
      if (remembered) return remembered;
      const audio = await this.storage.get(
        asset.key,
        AbortSignal.any([signal, AbortSignal.timeout(750)]),
      );
      signal.throwIfAborted();
      if (
        !audio ||
        audio.byteLength !== asset.bytes ||
        digest(audio) !== asset.sha256
      )
        return null;
      const prepared = { audio, sampleRate: asset.sampleRate };
      this.remember(asset.key, prepared);
      return prepared;
    } catch {
      signal.throwIfAborted();
      this.logger.warn("Prepared audio unavailable; using live pipeline");
      return null;
    }
  }

  /**
   * Отдаёт заготовленную запись.
   *
   * `lookupMs` — время, уже потраченное на поиск записи: без него метрика
   * задержки до первого звука набивалась бы нулями, и дашборд показывал бы
   * улучшение там, где его нет.
   */
  async *replay(
    prepared: PreparedAudio,
    requestId: string,
    signal: AbortSignal,
    lookupMs = 0,
  ): AsyncIterable<SpeechSynthesisStreamEvent> {
    const startedAt = performance.now();
    let timeToFirstAudioMs = lookupMs;
    const chunkBytes = Math.floor(prepared.sampleRate / 10) * 2;
    let sequence = 0;
    for (let offset = 0; offset < prepared.audio.length; offset += chunkBytes) {
      signal.throwIfAborted();
      const end = Math.min(offset + chunkBytes, prepared.audio.length);
      if (sequence === 0) {
        timeToFirstAudioMs = lookupMs + (performance.now() - startedAt);
      }
      yield {
        type: "audio.chunk",
        chunk: {
          streamId: requestId,
          sequence: sequence++,
          sampleRate: prepared.sampleRate,
          channels: 1,
          format: "pcm_s16le",
          isFinal: end === prepared.audio.length,
          audio: prepared.audio.slice(offset, end),
        },
      };
      await yieldToIO(undefined, { signal });
    }
    yield {
      type: "synthesis.completed",
      metrics: {
        timeToFirstAudioMs,
        durationMs: lookupMs + (performance.now() - startedAt),
        chunkCount: sequence,
        audioBytes: prepared.audio.length,
        attempts: [],
        source: "prepared",
      },
    };
  }

  /** One asset per lease; a crash resumes from persisted completed assets. */
  async tick(): Promise<void> {
    if (this.running || this.shutdown.signal.aborted) return;
    this.running = true;
    let claimed: Pack | undefined;
    let livePoll: ReturnType<typeof setInterval> | undefined;
    const liveCall = new AbortController();
    try {
      if (await this.preparations?.tick(this.shutdown.signal)) return;
      claimed = await this.claim();
      if (!claimed) return;
      const version = await this.scenarios.loadVersion(
        claimed.scenarioVersionId,
      );
      if (!version) throw new Error("Version missing");
      const requests = compilePreparedSpeech(version);
      const request = requests.find(
        (candidate) => !claimed?.assets[audioFingerprint(candidate)],
      );
      if (!request) {
        await this.finish(claimed, {
          status: "ready",
          total: requests.length,
          completed: requests.length,
        });
        return;
      }
      let checking = false;
      livePoll = setInterval(() => {
        if (checking) return;
        checking = true;
        void this.hasLiveCall()
          .then((live) => {
            if (live) liveCall.abort();
          })
          .catch(() => liveCall.abort())
          .finally(() => {
            checking = false;
          });
      }, 1_000);
      const signal = AbortSignal.any([
        this.shutdown.signal,
        liveCall.signal,
        AbortSignal.timeout(90_000),
      ]);
      const parts: Uint8Array[] = [];
      let bytes = 0;
      let sampleRate = 0;
      let completed = false;
      for await (const event of this.synthesis.synthesize(request, signal)) {
        if (event.type === "synthesis.completed") {
          completed = true;
          continue;
        }
        bytes += event.chunk.audio.byteLength;
        if (bytes > MAX_AUDIO_BYTES)
          throw new Error("Prepared audio too large");
        sampleRate = event.chunk.sampleRate;
        parts.push(event.chunk.audio);
      }
      signal.throwIfAborted();
      if (!completed || !bytes) throw new Error("Incomplete synthesis");
      const audio = new Uint8Array(bytes);
      let offset = 0;
      for (const part of parts) {
        audio.set(part, offset);
        offset += part.length;
      }
      const fingerprint = audioFingerprint(request);
      const sha256 = digest(audio);
      // Content-addressed: an expired worker cannot replace another worker's bytes.
      const key = `scenario-audio/v1/${version.id}/${fingerprint}/${sha256}.pcm`;
      await this.storage.put(key, audio, "application/octet-stream");
      const assets = {
        ...claimed.assets,
        [fingerprint]: { key, sampleRate, bytes, sha256 },
      };
      const count = Object.keys(assets).length;
      await this.finish(claimed, {
        assets,
        total: requests.length,
        completed: count,
        status: count === requests.length ? "ready" : "queued",
      });
    } catch (error) {
      if (claimed)
        await this.finish(claimed, {
          status:
            this.shutdown.signal.aborted || liveCall.signal.aborted
              ? "queued"
              : "failed",
        }).catch(() => undefined);
      this.logger.warn(
        `Scenario audio preparation interrupted or failed; assets retained for retry: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    } finally {
      clearInterval(livePoll);
      this.running = false;
    }
  }

  private async claim(): Promise<Pack | undefined> {
    return this.db.transaction(async (tx) => {
      // Serialize claims across instances, then allow only one non-expired lease.
      await tx.execute(sql`select pg_advisory_xact_lock(112, 106)`);
      const [busy] = await tx
        .select({ id: scenarioAudioPacks.scenarioVersionId })
        .from(scenarioAudioPacks)
        .where(
          and(
            eq(scenarioAudioPacks.status, "preparing"),
            gt(scenarioAudioPacks.leaseUntil, new Date()),
          ),
        )
        .limit(1);
      if (busy) return undefined;
      const [draftBusy] = await tx
        .select({ id: dialoguePreparations.id })
        .from(dialoguePreparations)
        .where(gt(dialoguePreparations.leaseUntil, new Date()))
        .limit(1);
      if (draftBusy) return undefined;
      // All backend instances observe live sessions, not only local sockets.
      const [live] = await tx
        .select({ id: callStates.trainingSessionId })
        .from(callStates)
        .where(eq(callStates.stage, "conversation"))
        .limit(1);
      if (live) return undefined;
      const now = new Date();
      const [pack] = await tx
        .select()
        .from(scenarioAudioPacks)
        .where(
          or(
            eq(scenarioAudioPacks.status, "queued"),
            and(
              eq(scenarioAudioPacks.status, "preparing"),
              lt(scenarioAudioPacks.leaseUntil, now),
            ),
          ),
        )
        .orderBy(scenarioAudioPacks.updatedAt)
        .limit(1)
        .for("update", { skipLocked: true });
      if (!pack) return undefined;
      const [claimed] = await tx
        .update(scenarioAudioPacks)
        .set({
          status: "preparing",
          leaseToken: randomUUID(),
          leaseUntil: new Date(now.getTime() + 120_000),
          updatedAt: now,
        })
        .where(eq(scenarioAudioPacks.scenarioVersionId, pack.scenarioVersionId))
        .returning();
      return claimed;
    });
  }

  private remember(key: string, prepared: PreparedAudio): void {
    // Вытесняется самая старая запись: Map хранит порядок добавления.
    while (
      this.verifiedBytes + prepared.audio.byteLength > MAX_VERIFIED_BYTES &&
      this.verified.size > 0
    ) {
      const [oldest, evicted] = this.verified.entries().next().value!;
      this.verified.delete(oldest);
      this.verifiedBytes -= evicted.audio.byteLength;
    }
    this.verified.set(key, prepared);
    this.verifiedBytes += prepared.audio.byteLength;
  }

  private async hasLiveCall(): Promise<boolean> {
    const [live] = await this.db
      .select({ id: callStates.trainingSessionId })
      .from(callStates)
      .where(eq(callStates.stage, "conversation"))
      .limit(1);
    return Boolean(live);
  }

  private async finish(
    pack: Pack,
    values: Partial<Pick<Pack, "status" | "completed" | "total" | "assets">>,
  ): Promise<void> {
    await this.db
      .update(scenarioAudioPacks)
      .set({
        ...values,
        leaseUntil: null,
        leaseToken: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(scenarioAudioPacks.scenarioVersionId, pack.scenarioVersionId),
          eq(scenarioAudioPacks.leaseToken, pack.leaseToken!),
        ),
      );
  }
}
