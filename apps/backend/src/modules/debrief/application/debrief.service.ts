import { Inject, Injectable, Logger } from "@nestjs/common";
import { z } from "zod";

import { AppNotFoundException } from "@/common/exceptions/app.exception";
import { ErrorCodes } from "@/contracts";
import {
  mixCallRecording,
  MIXDOWN_SAMPLE_RATE,
  toPcmBytes,
  type RecordingPart,
} from "@/modules/call-recording/domain/mixdown";
import { encodeWav } from "@/modules/call-recording/domain/wav";
import {
  RECORDING_STORAGE,
  type RecordingStorage,
} from "@/modules/call-recording/ports/recording-storage.port";
import { GrammarService } from "@/modules/grammar";
import { IncidentCardService } from "@/modules/incident-card/application/incident-card.service";
import type { IncidentCard } from "@/modules/incident-card/dto/incident-card.dto";

import {
  ADDRESS_FIELDS,
  cardValuesForReference,
  dispatchedServices,
} from "../domain/card-mapping";
import { incidentCardTexts } from "../domain/card-texts";
import { evaluateCall } from "../domain/evaluation";

import type {
  CallSummary,
  Debrief,
  DebriefEvaluation,
  DebriefFact,
  DebriefQuestion,
  DebriefRecordingSegment,
  TimelineEntry,
} from "../dto/debrief.dto";
import {
  DEBRIEF_STORE,
  type DebriefCall,
  type DebriefStore,
  type JournalEntry,
} from "../ports/debrief.store.port";

const MAX_CALLS = 50;

/** Манифест записи: его пишет сам конвейер, здесь он только читается. */
const ManifestSchema = z.object({
  segments: z.array(
    z.object({
      key: z.string(),
      track: z.enum(["operator", "caller"]),
      startMs: z.number().int(),
      durationMs: z.number().int(),
      sampleRate: z.number().int(),
    }),
  ),
});

/**
 * Разбор закончившегося звонка.
 *
 * Модуль ничего не считает и никого не оценивает: он показывает, что было —
 * реплики, раскрытые сведения, движение ступени паники, заполненную карточку и
 * запись. Балл и веса нарушений появятся отдельным модулем и будут читать эти
 * же данные.
 */
@Injectable()
export class DebriefService {
  private readonly logger = new Logger(DebriefService.name);

  constructor(
    @Inject(DEBRIEF_STORE) private readonly store: DebriefStore,
    @Inject(RECORDING_STORAGE) private readonly recordings: RecordingStorage,
    private readonly cards: IncidentCardService,
    private readonly grammar: GrammarService,
  ) {}

  listCalls(operatorId: string): Promise<readonly CallSummary[]> {
    return this.store.listCalls(operatorId, MAX_CALLS);
  }

  async get(trainingSessionId: string, operatorId: string): Promise<Debrief> {
    const call = await this.requireOwnCall(trainingSessionId, operatorId);
    const [journal, facts, questions, card, recording] = await Promise.all([
      this.store.loadJournal(trainingSessionId),
      this.store.loadFacts(call.scenarioVersionId),
      this.store.loadQuestions(call.scenarioVersionId),
      this.cards.get(trainingSessionId, operatorId),
      this.readRecording(trainingSessionId),
    ]);

    const revealed = new Set(call.revealedFactKeys);
    // Только правила: отчёт обязан повторяться на тех же данных, поэтому
    // модель сюда не зовут даже когда она доступна.
    const report = await this.grammar.check(incidentCardTexts(card));
    const grammar = {
      ...report,
      fields: report.fields.map((field) => ({
        ...field,
        issues: [...field.issues],
      })),
    };
    const revealedAt = this.revealTimes(journal);
    const debriefQuestions = questions.map((question): DebriefQuestion => ({
      text: question.text,
      isCritical: question.isCritical,
      // Вопрос закрыт, когда прозвучали все сведения, которыми он
      // считается закрытым: назвать улицу — ещё не назвать адрес.
      satisfied: question.satisfiedByFactKeys.every((key) =>
        revealed.has(key),
      ),
      satisfiedByFactKeys: [...question.satisfiedByFactKeys],
    }));

    return {
      call: this.toSummary(call),
      timings: {
        answerSeconds: this.answerSeconds(call),
        answerNormSeconds: call.answerNormSeconds,
        durationSeconds: call.durationSeconds,
        expectedDurationSeconds: call.expectedDurationSeconds,
      },
      finalPanicLevel: call.panicLevel,
      timeline: this.toTimeline(journal, facts, call),
      facts: facts.map((fact): DebriefFact => ({
        key: fact.key,
        label: fact.label,
        severity: fact.severity,
        revealed: revealed.has(fact.key),
        revealedAt: revealedAt.get(fact.key)?.toISOString() ?? null,
      })),
      questions: debriefQuestions,
      incidentCard: card,
      recording: this.toSegments(trainingSessionId, recording),
      recordingUrl:
        recording.length === 0
          ? null
          : `/api/v1/calls/${trainingSessionId}/recording`,
      // Незакончившийся звонок оценивать нечем: карточка ещё пишется, а
      // вопросы могут закрыться в следующую минуту.
      evaluation:
        call.stage === "ended"
          ? await this.evaluate(call, debriefQuestions, journal, card, revealed)
          : null,
      grammar,
    };
  }

  /**
   * Оценка звонка.
   *
   * Считается при первом открытии разбора и сохраняется: сравнение с группой
   * читает чужие оценки, а не пересчитывает чужие звонки.
   */
  private async evaluate(
    call: DebriefCall,
    questions: readonly DebriefQuestion[],
    journal: readonly JournalEntry[],
    card: IncidentCard | null,
    revealed: ReadonlySet<string>,
  ): Promise<DebriefEvaluation> {
    const reference = await this.store.loadReferenceCard(
      call.scenarioVersionId,
    );
    const evaluation = evaluateCall({
      questions: questions.map((question) => ({
        text: question.text,
        isCritical: question.isCritical,
        satisfied: question.satisfied,
        obtainedFactKeys: question.satisfiedByFactKeys.filter((key) =>
          revealed.has(key),
        ),
        expectedFactKeys: question.satisfiedByFactKeys,
      })),
      // Части адреса сверяются вхождением, чем бы их ни объявил автор
      // сценария: оператор пишет адрес одной строкой, и «улица Учебная» в ней
      // не равно ей целиком.
      reference: reference.map((field) => ({
        ...field,
        comparison: ADDRESS_FIELDS.includes(field.field)
          ? ("contains" as const)
          : field.comparison,
      })),
      cardValues: cardValuesForReference(card),
      expectedServices: call.expectedServices,
      dispatchedServices: dispatchedServices(card),
      answerSeconds: this.answerSeconds(call),
      answerNormSeconds: call.answerNormSeconds,
      forbiddenPhrases: this.forbiddenPhrases(journal),
      passThreshold: call.passThreshold,
    });

    if ((await this.store.loadScore(call.trainingSessionId)) !== evaluation.score) {
      await this.store.saveScore(
        call.trainingSessionId,
        call.scenarioVersionId,
        evaluation.score,
      );
    }

    const group = await this.store.loadGroupResult(
      call.scenarioVersionId,
      call.trainingSessionId,
    );

    return {
      score: evaluation.score,
      verdict: evaluation.verdict,
      passThreshold: evaluation.passThreshold,
      skills: [...evaluation.skills],
      fields: [...evaluation.fields],
      recommendations: [...evaluation.recommendations],
      difficulty: call.difficulty,
      groupAverageScore: group.calls === 0 ? null : group.averageScore,
      groupCalls: group.calls,
    };
  }

  /** Сколько раз оператор сказал то, чего диспетчеру говорить нельзя. */
  private forbiddenPhrases(journal: readonly JournalEntry[]): number {
    return journal.filter(
      (entry) =>
        (entry.type === "escalation.fired" ||
          entry.type === "panic.changed") &&
        entry.payload?.trigger === "forbidden_phrase",
    ).length;
  }

  /**
   * Разговор одной дорожкой.
   *
   * Собранная запись кладётся рядом с кусками: закончившийся звонок больше не
   * меняется, а собирать её заново на каждое открытие разбора — это полсотни
   * запросов в хранилище ради одного и того же файла.
   */
  async readWholeRecording(
    trainingSessionId: string,
    operatorId: string,
  ): Promise<Uint8Array<ArrayBuffer>> {
    await this.requireOwnCall(trainingSessionId, operatorId);

    const key = `calls/${trainingSessionId}/call.wav`;
    const stored = await this.recordings.get(key);

    if (stored !== null) {
      return stored;
    }

    const manifest = await this.readRecording(trainingSessionId);

    if (manifest.length === 0) {
      throw new AppNotFoundException(
        ErrorCodes.RECORDING_NOT_FOUND,
        "There is no recording for this call",
      );
    }

    const parts: RecordingPart[] = [];

    for (const segment of manifest) {
      const audio = await this.recordings.get(segment.key);

      // Пропавший кусок не должен стоить всей записи: на разборе лучше
      // разговор с дырой, чем отказ открыть его целиком.
      if (audio === null) {
        this.logger.warn(
          `Recording segment ${segment.key} is missing from storage`,
        );
        continue;
      }

      parts.push({
        audio,
        startMs: segment.startMs,
        sampleRate: segment.sampleRate,
      });
    }

    if (parts.length === 0) {
      throw new AppNotFoundException(
        ErrorCodes.RECORDING_NOT_FOUND,
        "The recording of this call is not in storage",
      );
    }

    const call = encodeWav(
      toPcmBytes(mixCallRecording(parts, MIXDOWN_SAMPLE_RATE)),
      MIXDOWN_SAMPLE_RATE,
    );

    try {
      await this.recordings.put(key, call, "audio/wav");
    } catch (error) {
      // Не сохранилось — разбор всё равно получит запись, просто следующий
      // раз соберём заново.
      this.logger.warn(
        `Could not store the mixed recording of ${trainingSessionId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }

    return call;
  }

  /** Кусок записи отдаётся через backend: корзина остаётся закрытой. */
  async readSegment(
    trainingSessionId: string,
    operatorId: string,
    index: number,
  ): Promise<Uint8Array<ArrayBuffer>> {
    await this.requireOwnCall(trainingSessionId, operatorId);

    const manifest = await this.readRecording(trainingSessionId);
    const segment = manifest[index];

    if (segment === undefined) {
      throw new AppNotFoundException(
        ErrorCodes.RECORDING_NOT_FOUND,
        "There is no such recording segment",
      );
    }

    const audio = await this.recordings.get(segment.key);

    if (audio === null) {
      throw new AppNotFoundException(
        ErrorCodes.RECORDING_NOT_FOUND,
        "The recording segment is not in storage",
      );
    }

    return audio;
  }

  private async requireOwnCall(
    trainingSessionId: string,
    operatorId: string,
  ): Promise<DebriefCall> {
    const call = await this.store.loadCall(trainingSessionId);

    // Чужой звонок неотличим от несуществующего, как и в карточке.
    if (call === null || call.operatorId !== operatorId) {
      throw new AppNotFoundException(
        ErrorCodes.CALL_NOT_FOUND,
        "There is no call for this training session",
      );
    }

    return call;
  }

  private async readRecording(
    trainingSessionId: string,
  ): Promise<z.infer<typeof ManifestSchema>["segments"]> {
    let raw: Uint8Array | null;

    try {
      raw = await this.recordings.get(
        `calls/${trainingSessionId}/manifest.json`,
      );
    } catch (error) {
      // Разбор без записи всё равно полезен: лента и карточка на месте.
      this.logger.warn(
        `Could not read the recording of ${trainingSessionId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );

      return [];
    }

    if (raw === null) {
      return [];
    }

    const parsed = ManifestSchema.safeParse(
      JSON.parse(new TextDecoder().decode(raw)),
    );

    return parsed.success ? parsed.data.segments : [];
  }

  private toSegments(
    trainingSessionId: string,
    segments: z.infer<typeof ManifestSchema>["segments"],
  ): DebriefRecordingSegment[] {
    return segments.map((segment, index) => ({
      track: segment.track,
      startMs: segment.startMs,
      durationMs: segment.durationMs,
      sampleRate: segment.sampleRate,
      url: `/api/v1/calls/${trainingSessionId}/recording/${index}`,
    }));
  }

  private toTimeline(
    journal: readonly JournalEntry[],
    facts: readonly { key: string; label: string }[],
    call: DebriefCall,
  ): TimelineEntry[] {
    const labels = new Map(facts.map((fact) => [fact.key, fact.label]));
    const zero =
      call.answeredAt === null ? null : new Date(call.answeredAt).getTime();

    return journal.map((entry): TimelineEntry => {
      const payload = entry.payload ?? {};
      const factKey = typeof payload.key === "string" ? payload.key : undefined;

      return {
        sequence: entry.sequence,
        at: entry.occurredAt.toISOString(),
        // От приёма вызова, как и смещения в записи: строку ленты можно не
        // только прочитать, но и переслушать.
        offsetMs:
          zero === null ? null : Math.max(0, entry.occurredAt.getTime() - zero),
        type: entry.type,
        actor: entry.actor,
        details:
          factKey === undefined
            ? payload
            : { ...payload, label: labels.get(factKey) ?? factKey },
      };
    });
  }

  private revealTimes(journal: readonly JournalEntry[]): Map<string, Date> {
    const times = new Map<string, Date>();

    for (const entry of journal) {
      const key = entry.payload?.key;

      if (entry.type === "fact.revealed" && typeof key === "string") {
        times.set(key, entry.occurredAt);
      }
    }

    return times;
  }

  private answerSeconds(call: DebriefCall): number | null {
    if (call.answeredAt === null) {
      return null;
    }

    return Math.max(
      0,
      Math.round(
        (new Date(call.answeredAt).getTime() -
          new Date(call.offeredAt).getTime()) /
          1_000,
      ),
    );
  }

  private toSummary(call: DebriefCall): CallSummary {
    return {
      trainingSessionId: call.trainingSessionId,
      scenarioCode: call.scenarioCode,
      title: call.title,
      stage: call.stage,
      offeredAt: call.offeredAt,
      answeredAt: call.answeredAt,
      endedAt: call.endedAt,
      durationSeconds: call.durationSeconds,
    };
  }
}
