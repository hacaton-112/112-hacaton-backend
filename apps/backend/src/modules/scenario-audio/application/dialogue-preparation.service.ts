import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import type { DialoguePreparation } from "@/contracts/dialogue-preparation";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import { dialoguePreparations } from "@/drizzle/schema";
import { AuditLogService } from "@/modules/audit-log/application/audit-log.service";
import {
  RECORDING_STORAGE,
  type RecordingStorage,
} from "@/modules/call-recording/ports/recording-storage.port";
import { encodeWav } from "@/modules/call-recording/domain/wav";
import type { ScenarioSeed } from "@/modules/scenario-engine/domain/scenario-seed.schema";
import { audioFingerprint } from "../domain/prepared-dialogue";
import {
  initialEntries,
  preparationHash,
  preparationRequests,
  validateEntries,
} from "../domain/dialogue-preparation";
import { parseScenarioAudioConfig } from "../infrastructure/scenario-audio.config";

type Job = typeof dialoguePreparations.$inferSelect;
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const MAX_BYTES = 8 * 1024 * 1024;

@Injectable()
export class DialoguePreparationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService["db"],
    @Inject(RECORDING_STORAGE) private readonly storage: RecordingStorage,
    private readonly config: ConfigService,
    private readonly audit: AuditLogService,
  ) {}

  private get workerEnabled(): boolean {
    return parseScenarioAudioConfig({
      SCENARIO_AUDIO_WORKER_ENABLED: this.config.get(
        "SCENARIO_AUDIO_WORKER_ENABLED",
      ),
    }).workerEnabled;
  }

  async create(
    ownerId: string,
    scenario: ScenarioSeed,
    useAi: boolean,
    authoring: {
      authoringSource: "manual" | "assistant";
      authoringPrompt?: string;
    } = { authoringSource: "manual" },
  ): Promise<DialoguePreparation> {
    const snapshotHash = preparationHash(scenario);
    let total: number;
    try {
      total = preparationRequests("preview", scenario).length;
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Invalid preparation",
      );
    }
    // A repeated command or reconnect resumes the same snapshot, never duplicates heavy work.
    const job = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(dialoguePreparations)
        .values({
          id: randomUUID(),
          ownerId,
          snapshotHash,
          snapshot: scenario,
          authoringSource: authoring.authoringSource,
          authoringPrompt: authoring.authoringPrompt,
          status: useAi ? "queued" : "review",
          entries: useAi ? [] : initialEntries(scenario),
          total,
        })
        .onConflictDoNothing()
        .returning();
      if (created) {
        await this.audit.log(
          {
            actorId: ownerId,
            action: "scenario.dialogue.create",
            resource: "dialogue_preparation",
            resourceId: created.id,
            details: { useAi, snapshotHash },
          },
          tx,
        );
        return created;
      }
      const [existing] = await tx
        .select()
        .from(dialoguePreparations)
        .where(
          and(
            eq(dialoguePreparations.ownerId, ownerId),
            eq(dialoguePreparations.snapshotHash, snapshotHash),
          ),
        );
      return existing;
    });
    return this.present(job);
  }

  private async load(id: string, ownerId: string): Promise<Job> {
    const [job] = await this.db
      .select()
      .from(dialoguePreparations)
      .where(
        and(
          eq(dialoguePreparations.id, id),
          eq(dialoguePreparations.ownerId, ownerId),
        ),
      );
    if (!job) throw new NotFoundException("Preparation not found");
    return job;
  }

  async status(id: string, ownerId: string) {
    return this.present(await this.load(id, ownerId));
  }

  async list(ownerId: string) {
    const jobs = await this.db
      .select({
        id: dialoguePreparations.id,
        snapshot: dialoguePreparations.snapshot,
        status: dialoguePreparations.status,
        updatedAt: dialoguePreparations.updatedAt,
      })
      .from(dialoguePreparations)
      .where(
        and(
          eq(dialoguePreparations.ownerId, ownerId),
          ne(dialoguePreparations.status, "published"),
        ),
      )
      .orderBy(desc(dialoguePreparations.updatedAt))
      .limit(20);
    return jobs.map((job) => ({
      id: job.id,
      code: job.snapshot.code,
      title: job.snapshot.title,
      status: job.status,
      updatedAt: job.updatedAt.toISOString(),
    }));
  }

  async snapshot(id: string, ownerId: string) {
    const job = await this.load(id, ownerId);
    return {
      scenario: job.snapshot,
      authoringSource: job.authoringSource,
      authoringPrompt: job.authoringPrompt,
    };
  }

  private present(job: Job): DialoguePreparation {
    return {
      id: job.id,
      snapshotHash: job.snapshotHash,
      revision: job.revision,
      status: job.status,
      entries: job.entries,
      completed: job.completed,
      total: job.total,
      workerEnabled: this.workerEnabled,
      error: job.error,
      scenarioVersionId: job.scenarioVersionId,
      previews: preparationRequests(job.id, job.snapshot).map(
        (request, index) => ({
          index,
          text: request.text,
          ready: Boolean(job.assets[audioFingerprint(request)]),
        }),
      ),
    };
  }

  async review(id: string, ownerId: string, revision: number, input: unknown) {
    const job = await this.load(id, ownerId);
    let entries: Job["entries"];
    try {
      entries = validateEntries(job.snapshot, input);
    } catch {
      throw new BadRequestException(
        "Review must contain valid questions for each original fact",
      );
    }
    return this.change(
      job,
      revision,
      ["review"],
      { entries, error: null },
      "review",
    );
  }

  async approve(id: string, ownerId: string, revision: number) {
    const job = await this.load(id, ownerId);
    validateEntries(job.snapshot, job.entries);
    return this.change(
      job,
      revision,
      ["review"],
      {
        status: "synthesizing",
        approvedAt: new Date(),
        error: null,
        attempts: 0,
      },
      "approve",
    );
  }

  async retry(id: string, ownerId: string, revision: number) {
    const job = await this.load(id, ownerId);
    return this.change(
      job,
      revision,
      ["failed"],
      {
        status: job.approvedAt ? "synthesizing" : "queued",
        attempts: 0,
        error: null,
      },
      "retry",
    );
  }

  /** Return to review invalidates the lease and audio approval, never a published pack. */
  async reopen(id: string, ownerId: string, revision: number) {
    const job = await this.load(id, ownerId);
    return this.change(
      job,
      revision,
      ["review", "ready", "failed", "synthesizing", "queued", "generating"],
      {
        status: "review",
        entries:
          job.entries.length === job.snapshot.facts.length
            ? job.entries
            : initialEntries(job.snapshot),
        approvedAt: null,
        error: null,
        attempts: 0,
      },
      "reopen",
    );
  }

  private async change(
    job: Job,
    revision: number,
    statuses: Job["status"][],
    patch: Partial<Job>,
    action: string,
  ) {
    return this.db.transaction(async (tx) => {
      if (!statuses.includes(job.status))
        throw new ConflictException("Preparation state has changed");
      const [updated] = await tx
        .update(dialoguePreparations)
        .set({ ...patch, revision: revision + 1, updatedAt: new Date() })
        .where(
          and(
            eq(dialoguePreparations.id, job.id),
            eq(dialoguePreparations.revision, revision),
            eq(dialoguePreparations.status, job.status),
            isNull(dialoguePreparations.scenarioVersionId),
          ),
        )
        .returning();
      if (!updated)
        throw new ConflictException("Preparation revision has changed");
      await this.audit.log(
        {
          actorId: job.ownerId,
          action: `scenario.dialogue.${action}`,
          resource: "dialogue_preparation",
          resourceId: job.id,
          details: { revision: updated.revision },
        },
        tx,
      );
      return this.present(updated);
    });
  }

  async preview(id: string, ownerId: string, index: number): Promise<Buffer> {
    const job = await this.load(id, ownerId);
    const request = preparationRequests(job.id, job.snapshot)[index];
    const asset = request && job.assets[audioFingerprint(request)];
    if (!asset || asset.bytes > MAX_BYTES)
      throw new NotFoundException("Audio is not ready");
    const audio = await this.storage.get(asset.key, AbortSignal.timeout(5_000));
    if (
      !audio ||
      audio.byteLength !== asset.bytes ||
      digest(audio) !== asset.sha256
    )
      throw new NotFoundException("Audio unavailable");
    return Buffer.from(encodeWav(audio, asset.sampleRate));
  }
}
