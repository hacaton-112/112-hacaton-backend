import type { IncomingMessage } from "node:http";

import { Inject, Logger, type OnModuleInit } from "@nestjs/common";
import { OfflineAudioNotReadyError } from "@/modules/scenario-audio/scenario-audio.service";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from "@nestjs/websockets";
import WebSocket, { type RawData } from "ws";

import {
  AppConflictException,
  AppException,
} from "@/common/exceptions/app.exception";
import {
  ErrorCodes,
  VoicePipelineClientCommandSchema,
  VoicePipelineServerEventSchema,
  type VoicePipelineClientCommand,
  type VoicePipelineServerEvent,
  type VoicePipelineSocketErrorCode,
} from "@/contracts";
import { generateId } from "@/common/utils/id";
import {
  ASR_STREAMER,
  type AsrStreamer,
  type AsrStreamHandle,
  type AsrTranscript,
} from "@/modules/asr/asr-stream.port";
import { AccessTokenVerifier } from "@/modules/auth/access-token.verifier";
import {
  CALL_RECORDER,
  type CallRecorder,
  type RecordingSegment,
} from "@/modules/call-recording";
import type { VerifiedJwtPayload } from "@/modules/auth/dto/jwt-payload.dto";
import { IncidentCardService } from "@/modules/incident-card/application/incident-card.service";
import {
  INITIATIVE_OPERATOR_TEXT,
  ScenarioEngineError,
  ScenarioEngineService,
  type CallSnapshot,
  type EngineOpeningTurn,
} from "@/modules/scenario-engine";
import { TrainingService } from "@/modules/training/training.service";

import { VoicePipelineService } from "../../application/voice-pipeline.service";
import {
  VOICE_PIPELINE_METRICS,
  type VoicePipelineMetrics,
} from "../../application/voice-pipeline.metrics";
import type { VoicePipelineRequestFactory } from "../../application/voice-pipeline-request.factory";
import { VOICE_PIPELINE_REQUEST_FACTORY } from "../../voice-pipeline.tokens";

const MAX_COMMAND_BYTES = 16_384;
/**
 * Как часто сервер двигает звонок сам. Секунда — компромисс: пороги молчания в
 * сценариях задаются секундами, а более частый опрос упирался бы в базу без
 * пользы для слуха оператора.
 */
const TICK_INTERVAL_MS = 1_000;
/**
 * Как часто спрашиваем клиента, жив ли он. Оборванный без закрытия сокет
 * остаётся `OPEN` до тех пор, пока это не заметит TCP, а звонок всё это время
 * идёт: тикает время, копится паника и тратится квота на генерацию.
 */
const HEARTBEAT_INTERVAL_MS = 15_000;
const SESSION_RECOVERY_WINDOW_MS = 30_000;
const CONNECTED_RECOVERY_LEASE_MS =
  SESSION_RECOVERY_WINDOW_MS + HEARTBEAT_INTERVAL_MS;
const SESSION_RECOVERY_WINDOW_SECONDS = SESSION_RECOVERY_WINDOW_MS / 1_000;
const MAX_RECOVERY_LEASES_ON_STARTUP = 1_000;
/** Учебные звонки идут по-русски: распознавание не гадает язык по звуку. */
const OPERATOR_LANGUAGE = "ru";
/** Формат, в котором клиент шлёт кадры: тот же, что принимает распознавание. */
const OPERATOR_SAMPLE_RATE = 16_000;
/**
 * Длиннее реплика оператора в генерацию не пройдёт — столько разрешает
 * `operatorText` в контракте. Реплика, упёршаяся в потолок распознавания,
 * обрезается по началу: вопрос стоит там, а не в конце.
 */
const MAX_UTTERANCE_CHARACTERS = 1_000;
/**
 * Граница расшифровки в контракте события.
 *
 * Одна VAD-реплика ограничена контрактом, а распознавание на шуме умеет
 * выдумывать текст километрами. Отправка разбирает
 * событие схемой, которая бросает, а не обрезает: без этой границы длинная
 * реплика осталась бы не только неотправленной, но и без хода — исключение
 * улетело бы из необработанного промиса.
 */
const MAX_TRANSCRIPT_CHARACTERS = 4_000;
/** Application-level close code mirroring HTTP 401. */
const UNAUTHORIZED_CLOSE_CODE = 4401;
const GATEWAY_PATH = "/api/v1/voice-pipeline/stream";

export function websocketAuthorization(
  request?: IncomingMessage,
): string | undefined {
  if (request?.headers.authorization) return request.headers.authorization;
  const protocols = request?.headers["sec-websocket-protocol"]
    ?.split(",")
    .map((value) => value.trim());
  const bearer = protocols?.indexOf("bearer") ?? -1;
  const token = bearer >= 0 ? protocols?.[bearer + 1] : undefined;
  return token ? `Bearer ${token}` : undefined;
}

interface ActiveRequest {
  controller: AbortController;
  requestId: string;
}

/** Постоянный поток микрофона на всё время разговора. */
interface ListeningStream {
  streamId: string;
  stream: AsrStreamHandle;
  /** Тот же звук уходит в запись: распознавание её не заменяет. */
  recording: RecordingSegment;
}

interface ConnectionState {
  activeRequest: ActiveRequest | null;
  /** Идентификатор учебной сессии; появляется только после команды start. */
  sessionId: string;
  callStarted: boolean;
  timer: NodeJS.Timeout | null;
  heartbeat: NodeJS.Timeout | null;
  /** Ответил ли клиент на прошлый ping. */
  alive: boolean;
  /** Последний отправленный снимок: событие идёт только при изменении. */
  lastSnapshotKey: string | null;
  listening: ListeningStream | null;
  /** Про звук вне окна предупреждаем один раз, а не на каждом кадре. */
  strayAudioWarned: boolean;
  user: VerifiedJwtPayload;
}

interface RecoverableSession {
  state: ConnectionState;
  timeout: NodeJS.Timeout;
}

type WithoutEventMetadata<T> = T extends unknown
  ? Omit<T, "eventId" | "sessionId" | "timestamp">
  : never;

type VoicePipelineServerEventInput =
  WithoutEventMetadata<VoicePipelineServerEvent>;

@WebSocketGateway({ path: GATEWAY_PATH, maxPayload: MAX_COMMAND_BYTES })
export class VoicePipelineGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  private readonly logger = new Logger(VoicePipelineGateway.name);
  private readonly connections = new WeakMap<WebSocket, ConnectionState>();
  private readonly sessionClients = new Map<string, WebSocket>();
  private readonly recoverableSessions = new Map<string, RecoverableSession>();
  private readonly persistedRecoveryTimeouts = new Map<
    string,
    NodeJS.Timeout
  >();

  constructor(
    private readonly voicePipeline: VoicePipelineService,
    @Inject(VOICE_PIPELINE_REQUEST_FACTORY)
    private readonly requestFactory: VoicePipelineRequestFactory,
    private readonly accessTokenVerifier: AccessTokenVerifier,
    private readonly engine: ScenarioEngineService,
    @Inject(ASR_STREAMER)
    private readonly asr: AsrStreamer,
    @Inject(CALL_RECORDER)
    private readonly recorder: CallRecorder,
    private readonly incidentCards: IncidentCardService,
    private readonly training: TrainingService,
    @Inject(VOICE_PIPELINE_METRICS)
    private readonly metrics: VoicePipelineMetrics,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const leases = await this.engine.listRecoveryLeases(
        MAX_RECOVERY_LEASES_ON_STARTUP,
      );
      for (const lease of leases) {
        this.schedulePersistedRecovery(
          lease.trainingSessionId,
          lease.expiresAt,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Could not restore recovery leases: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  /**
   * The handshake carries the same Bearer token as the REST surface: without
   * it anyone able to reach the port could drive the pipeline, spending Alice
   * AI quota and GPU time and, once sessions hold training data, reading
   * another operator's call.
   */
  async handleConnection(
    client: WebSocket,
    request?: IncomingMessage,
  ): Promise<void> {
    const user = await this.accessTokenVerifier.verify(
      websocketAuthorization(request),
    );

    if (user === null) {
      this.logger.warn("Rejected an unauthenticated voice pipeline connection");
      client.close(UNAUTHORIZED_CLOSE_CODE, "Unauthorized");

      return;
    }

    this.connections.set(client, {
      activeRequest: null,
      // Идентификатор выдаёт сервер, а не клиент: иначе, зная чужой, можно было
      // бы подключиться к чужому звонку.
      sessionId: generateId(),
      callStarted: false,
      timer: null,
      heartbeat: null,
      alive: true,
      lastSnapshotKey: null,
      listening: null,
      strayAudioWarned: false,
      user,
    });
    this.metrics.sessionOpened();

    client.on("message", (data, isBinary) => {
      void this.handleClientMessage(client, data, isBinary);
    });

    this.startHeartbeat(client);
  }

  /**
   * Клиент, переставший отвечать, отключается сам.
   *
   * Иначе брошенный сокет держал бы за собой поток распознавания, открытый
   * кусок записи и секундный таймер, который продолжал бы вести звонок в
   * пустоту.
   */
  private startHeartbeat(client: WebSocket): void {
    const state = this.connections.get(client);

    if (state === undefined) {
      return;
    }

    client.on("pong", () => {
      state.alive = true;
    });

    state.heartbeat = setInterval(() => {
      if (!state.alive) {
        this.logger.warn(
          `Dropped an unresponsive client of session ${state.sessionId}`,
        );
        client.terminate();

        return;
      }

      if (state.callStarted) {
        void this.persistRecoveryLease(state, CONNECTED_RECOVERY_LEASE_MS);
      }
      state.alive = false;
      client.ping();
    }, HEARTBEAT_INTERVAL_MS);
    // Таймер не должен сам по себе держать процесс живым.
    state.heartbeat.unref();
  }

  handleDisconnect(client: WebSocket): void {
    const state = this.connections.get(client);

    if (state !== undefined) {
      this.metrics.sessionClosed();
      this.stopTicking(state);
      this.abortListening(state);

      if (state.heartbeat !== null) {
        clearInterval(state.heartbeat);
        state.heartbeat = null;
      }

      // Короткий обрыв не завершает звонок: даём клиенту переподключиться к
      // той же сессии. По истечении окна восстановление завершит её как
      // брошенную, чтобы не оставить открытыми попытку, запись и карточку.
      this.sessionClients.delete(state.sessionId);
      if (state.callStarted) {
        this.scheduleRecovery(state);
      }
    }

    state?.activeRequest?.controller.abort(
      new DOMException("WebSocket disconnected", "AbortError"),
    );
    this.connections.delete(client);
  }

  private scheduleRecovery(state: ConnectionState): void {
    const sessionId = state.sessionId;
    const existing = this.recoverableSessions.get(sessionId);
    if (existing) clearTimeout(existing.timeout);

    const timeout = setTimeout(() => {
      void this.expireRecovery(sessionId, state).catch((error) => {
        this.logger.error(
          `Could not expire recovery for session ${sessionId}: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      });
    }, SESSION_RECOVERY_WINDOW_MS);
    timeout.unref();
    this.recoverableSessions.set(sessionId, { state, timeout });
    void this.persistRecoveryLease(state, SESSION_RECOVERY_WINDOW_MS);
  }

  private clearRecovery(sessionId: string): void {
    const recoverable = this.recoverableSessions.get(sessionId);
    if (recoverable) clearTimeout(recoverable.timeout);
    this.recoverableSessions.delete(sessionId);
  }

  private clearPersistedRecoveryTimer(sessionId: string): void {
    const timeout = this.persistedRecoveryTimeouts.get(sessionId);
    if (timeout) clearTimeout(timeout);
    this.persistedRecoveryTimeouts.delete(sessionId);
  }

  private schedulePersistedRecovery(sessionId: string, expiresAt: Date): void {
    this.clearPersistedRecoveryTimer(sessionId);
    const delay = Math.max(0, expiresAt.getTime() - Date.now());
    const timeout = setTimeout(() => {
      this.persistedRecoveryTimeouts.delete(sessionId);
      void this.expirePersistedRecovery(sessionId).catch((error) => {
        this.logger.error(
          `Could not expire persisted recovery for session ${sessionId}: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      });
    }, delay);
    timeout.unref();
    this.persistedRecoveryTimeouts.set(sessionId, timeout);
  }

  private async expirePersistedRecovery(sessionId: string): Promise<void> {
    const now = new Date();
    const retryAt = new Date(now.getTime() + SESSION_RECOVERY_WINDOW_MS);
    const claimed = await this.engine.claimExpiredRecoveryLease(
      sessionId,
      now,
      retryAt,
    );
    if (!claimed) return;

    try {
      // Побочные проекции закрываются до источника истины. Если любой шаг
      // оборвётся, звонок всё ещё active и сохранённая retry-lease позволит
      // следующему процессу безопасно повторить идемпотентную уборку.
      await this.incidentCards.close(sessionId);
      await this.training.finishAttempt(sessionId, "abandoned");
      this.recorder.finishCall(sessionId);
      await this.engine.endCall({
        trainingSessionId: sessionId,
        eventId: generateId(),
        reason: "disconnected",
      });
    } catch (error) {
      this.schedulePersistedRecovery(sessionId, retryAt);
      throw error;
    }
  }

  private async persistRecoveryLease(
    state: ConnectionState,
    lifetimeMs: number,
  ): Promise<void> {
    try {
      await this.engine.renewRecoveryLease(
        state.sessionId,
        state.user.sub,
        new Date(Date.now() + lifetimeMs),
      );
    } catch (error) {
      this.logger.warn(
        `Could not persist recovery lease for session ${state.sessionId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  private async expireRecovery(
    sessionId: string,
    state: ConnectionState,
  ): Promise<void> {
    const recoverable = this.recoverableSessions.get(sessionId);
    if (!recoverable || recoverable.state !== state) return;

    this.recoverableSessions.delete(sessionId);
    this.clearPersistedRecoveryTimer(sessionId);
    try {
      await this.endAbandonedCall(state);
      await this.training.finishAttempt(sessionId, "abandoned");
    } finally {
      state.callStarted = false;
      this.recorder.finishCall(sessionId);
    }
  }

  /** Тот же путь, что и команда `end`, только причина другая. */
  private async endAbandonedCall(state: ConnectionState): Promise<void> {
    if (!state.callStarted) {
      return;
    }

    try {
      await this.engine.endCall({
        trainingSessionId: state.sessionId,
        eventId: generateId(),
        reason: "disconnected",
      });
      await this.incidentCards.close(state.sessionId);
    } catch (error) {
      // Сокет обрывается и сразу после обычного завершения: звонок уже
      // закончен, и это нормальный ход событий, а не сбой.
      if (
        error instanceof ScenarioEngineError &&
        error.code === "call-stage-forbidden"
      ) {
        return;
      }

      this.logger.warn(
        `Could not end the abandoned call ${state.sessionId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  /**
   * Ход времени на стороне сервера: без него молчание оператора ничего не
   * меняет, потому что всё остальное происходит в ответ на его команды.
   */
  private startTicking(client: WebSocket, state: ConnectionState): void {
    this.stopTicking(state);

    state.timer = setInterval(() => {
      void this.advanceCall(client);
    }, TICK_INTERVAL_MS);
    state.timer.unref();
  }

  private stopTicking(state: ConnectionState): void {
    if (state.timer !== null) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  async advanceCall(client: WebSocket): Promise<void> {
    const state = this.connections.get(client);

    if (state === undefined) {
      return;
    }

    if (client.readyState !== WebSocket.OPEN) {
      this.stopTicking(state);

      return;
    }

    try {
      const directives = await this.engine.tick({
        trainingSessionId: state.sessionId,
      });

      const snapshot = await this.engine.getSnapshot(state.sessionId);

      if (snapshot.stage !== "conversation") {
        this.stopTicking(state);

        return;
      }

      const key = JSON.stringify(this.snapshotFields(snapshot));

      // Состояние уходит клиенту только когда изменилось: раз в секунду слать
      // одно и то же — шум и в сети, и в журнале отладки.
      if (key === state.lastSnapshotKey) {
        return;
      }

      state.lastSnapshotKey = key;

      await this.sendEvent(client, state, {
        type: "call.state",
        revealedFactKeys: [...snapshot.revealedFactKeys],
        ...this.snapshotFields(snapshot),
      });

      await this.speakOnInitiative(client, state, directives);
    } catch (error) {
      this.logger.warn(
        `Stopped advancing session ${state.sessionId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      this.stopTicking(state);
    }
  }

  async handleClientMessage(
    client: WebSocket,
    data: RawData,
    isBinary: boolean,
  ): Promise<void> {
    const state = this.connections.get(client);
    if (state === undefined) {
      return;
    }

    if (isBinary) {
      this.handleAudioFrame(state, data);
      return;
    }

    const text = this.decodeText(data);
    if (text === null || Buffer.byteLength(text, "utf8") > MAX_COMMAND_BYTES) {
      await this.sendError(client, state, null, "invalid-message");
      return;
    }

    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      await this.sendError(client, state, null, "invalid-message");
      return;
    }

    const parsed = VoicePipelineClientCommandSchema.safeParse(value);
    if (!parsed.success) {
      await this.sendError(client, state, null, "invalid-message");
      return;
    }

    if (parsed.data.type === "resume") {
      await this.resumeSession(client, state, parsed.data);
      return;
    }

    if (parsed.data.type === "cancel") {
      await this.cancelActiveRequest(client, state);
      return;
    }

    if (parsed.data.type === "listen.start") {
      await this.startListening(client, state);
      return;
    }

    if (parsed.data.type === "listen.stop") {
      await this.stopListening(client, state);
      return;
    }

    if (parsed.data.type !== "speak") {
      await this.handleCallCommand(client, state, parsed.data);
      return;
    }

    if (!state.callStarted) {
      await this.sendError(client, state, null, "call-state-invalid");
      return;
    }

    await this.startRequest(client, state, parsed.data);
  }

  private async resumeSession(
    client: WebSocket,
    connectionState: ConnectionState,
    command: Extract<VoicePipelineClientCommand, { type: "resume" }>,
  ): Promise<void> {
    const recoverable = this.recoverableSessions.get(command.sessionId);
    let recoveredFromPersistence = false;
    let state: ConnectionState;

    if (recoverable?.state.user.sub === connectionState.user.sub) {
      clearTimeout(recoverable.timeout);
      this.recoverableSessions.delete(command.sessionId);
      state = recoverable.state;
    } else {
      let claimed = false;
      try {
        claimed = await this.engine.claimRecoveryLease(
          command.sessionId,
          connectionState.user.sub,
          new Date(),
          new Date(Date.now() + CONNECTED_RECOVERY_LEASE_MS),
        );
      } catch (error) {
        this.logger.warn(
          `Could not claim recovery lease for session ${command.sessionId}: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      }

      if (!claimed) {
        await this.sendError(
          client,
          connectionState,
          null,
          "session-recovery-unavailable",
        );
        return;
      }

      recoveredFromPersistence = true;
      state = {
        ...connectionState,
        sessionId: command.sessionId,
        callStarted: true,
        heartbeat: null,
      };
    }

    this.clearPersistedRecoveryTimer(command.sessionId);
    if (connectionState.heartbeat !== null) {
      clearInterval(connectionState.heartbeat);
      connectionState.heartbeat = null;
    }

    state.user = connectionState.user;
    state.alive = true;
    state.lastSnapshotKey = null;
    this.connections.set(client, state);
    this.sessionClients.set(state.sessionId, client);
    this.startHeartbeat(client);

    try {
      const [snapshot, dialogue] = await Promise.all([
        this.engine.getSnapshot(state.sessionId),
        this.engine.getRecentTurns(state.sessionId),
      ]);

      if (snapshot.stage === "ended" || snapshot.stage === "declined") {
        state.callStarted = false;
        this.sessionClients.delete(state.sessionId);
        this.recorder.finishCall(state.sessionId);
        await this.sendError(
          client,
          state,
          null,
          "session-recovery-unavailable",
        );
        return;
      }

      if (recoveredFromPersistence && snapshot.answeredAt !== null) {
        this.recorder.resumeCall(state.sessionId, snapshot.answeredAt);
      }
      await this.persistRecoveryLease(state, CONNECTED_RECOVERY_LEASE_MS);

      await this.sendEvent(client, state, {
        type: "call.resumed",
        scenarioCode: snapshot.scenarioCode,
        title: snapshot.title,
        locator: snapshot.locator,
        revealedFactKeys: [...snapshot.revealedFactKeys],
        dialogue: dialogue.map((turn) => ({ ...turn })),
        offeredAt: snapshot.offeredAt.toISOString(),
        answeredAt: snapshot.answeredAt?.toISOString() ?? null,
        recoveryWindowSeconds: SESSION_RECOVERY_WINDOW_SECONDS,
        ...this.snapshotFields(snapshot),
      });

      if (snapshot.stage === "conversation") {
        this.startTicking(client, state);
        if (command.resumeListening) {
          await this.startListening(client, state);
        }
      }
    } catch (error) {
      this.logger.warn(
        `Could not recover session ${command.sessionId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      this.sessionClients.delete(state.sessionId);
      await this.sendError(client, state, null, "session-recovery-unavailable");
      if (state.heartbeat !== null) {
        clearInterval(state.heartbeat);
        state.heartbeat = null;
      }
      if (state.callStarted) this.scheduleRecovery(state);
      connectionState.alive = true;
      this.connections.set(client, connectionState);
      this.startHeartbeat(client);
    }
  }

  /** Команды жизненного цикла звонка идут прямо в движок сценария. */
  private async handleCallCommand(
    client: WebSocket,
    state: ConnectionState,
    command: Exclude<
      VoicePipelineClientCommand,
      | { type: "speak" }
      | { type: "cancel" }
      | { type: "resume" }
      | { type: `listen.${string}` }
    >,
  ): Promise<void> {
    try {
      if (command.type === "start") {
        await this.voicePipeline.assertCanStart?.(command.scenarioVersionId);
        // Каждый вызов — своя учебная сессия. Соединение переживает несколько
        // звонков подряд, а журнал, запись и разбор принадлежат звонку.
        state.sessionId = generateId();
        state.lastSnapshotKey = null;

        // Попытка резервируется раньше звонка: лимит и номер проверяются под
        // блокировкой назначения, а не после того, как звонок уже создан.
        const reserved = state.user.role === "operator";
        if (reserved) {
          await this.training.reserveAttempt({
            assignmentId: command.assignmentId ?? "",
            operatorId: state.user.sub,
            scenarioVersionId: command.scenarioVersionId,
            trainingSessionId: state.sessionId,
          });
        }

        let snapshot: CallSnapshot;
        try {
          snapshot = await this.engine.startCall({
            trainingSessionId: state.sessionId,
            scenarioVersionId: command.scenarioVersionId,
            eventId: generateId(),
            operatorId: state.user.sub,
          });
        } catch (error) {
          if (reserved) {
            await this.training.finishAttempt(state.sessionId, "abandoned");
          }
          throw error;
        }
        state.callStarted = true;
        this.sessionClients.set(state.sessionId, client);
        await this.persistRecoveryLease(state, CONNECTED_RECOVERY_LEASE_MS);

        await this.sendEvent(client, state, {
          type: "call.offered",
          scenarioCode: snapshot.scenarioCode,
          title: snapshot.title,
          locator: snapshot.locator,
          ...this.snapshotFields(snapshot),
        });

        return;
      }

      if (command.type === "accept") {
        const snapshot = await this.engine.acceptCall({
          trainingSessionId: state.sessionId,
          eventId: generateId(),
        });
        await this.training.activateAttempt(state.sessionId);

        // Запись начинается с принятого вызова: смещения в манифесте считаются
        // от той же секунды, с которой начинается разговор.
        this.recorder.startCall(state.sessionId);
        this.startTicking(client, state);

        await this.sendEvent(client, state, {
          type: "call.accepted",
          openingLine: snapshot.openingLine,
          ...this.snapshotFields(snapshot),
        });

        await this.startOpeningLine(client, state, snapshot.openingTurn);

        return;
      }

      const snapshot =
        command.type === "decline"
          ? await this.engine.declineCall({
              trainingSessionId: state.sessionId,
              eventId: generateId(),
            })
          : await this.engine.endCall({
              trainingSessionId: state.sessionId,
              eventId: generateId(),
              reason: "operator",
            });

      // Финал попытки фиксируется сразу за движком: в гонке с преподавателем
      // выигрывает тот, кто первым закончил звонок.
      await this.training.finishAttempt(
        state.sessionId,
        command.type === "decline" ? "declined" : "completed",
      );
      this.clearRecovery(state.sessionId);
      this.clearPersistedRecoveryTimer(state.sessionId);
      this.sessionClients.delete(state.sessionId);
      this.stopTicking(state);
      this.abortListening(state);
      this.recorder.finishCall(state.sessionId);
      // Карточка закрывается вместе со звонком: дописанное после разговора
      // оценивать нечестно.
      await this.incidentCards.close(state.sessionId);
      await this.cancelActiveRequest(client, state);
      await this.sendEvent(client, state, {
        type: "call.ended",
        reason: command.type === "decline" ? "declined" : "operator",
        ...this.snapshotFields(snapshot),
      });
      state.callStarted = false;
    } catch (error) {
      this.logger.warn(
        `Rejected ${command.type} for session ${state.sessionId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      await this.sendError(client, state, null, this.commandErrorCode(error));
    }
  }

  private commandErrorCode(error: unknown): VoicePipelineSocketErrorCode {
    if (error instanceof OfflineAudioNotReadyError)
      return "scenario-audio-not-ready";
    if (error instanceof ScenarioEngineError) return "call-state-invalid";
    if (error instanceof AppException) {
      if (error.code === ErrorCodes.ASSIGNMENT_MAX_ATTEMPTS_REACHED) {
        return "assignment-attempts-exhausted";
      }
      if (error.code === ErrorCodes.ASSIGNMENT_ATTEMPT_ACTIVE) {
        return "assignment-attempt-active";
      }
      if (error.code === ErrorCodes.ASSIGNMENT_NOT_AVAILABLE) {
        return "assignment-unavailable";
      }
    }
    return "context-unavailable";
  }

  /**
   * Преподаватель останавливает занятие оператора.
   *
   * Звонок, уже закончившийся в движке (например, оператор положил трубку
   * мгновением раньше), не мешает закрыть висящую попытку.
   */
  async endSessionByInstructor(
    trainingSessionId: string,
    instructorId: string,
    reason: string,
  ): Promise<Date> {
    const client = this.sessionClients.get(trainingSessionId);
    const state = client ? this.connections.get(client) : undefined;
    const recoverable = this.recoverableSessions.get(trainingSessionId);
    const endedAt = new Date();
    let snapshot: CallSnapshot | null = null;
    try {
      snapshot = await this.engine.endCallByInstructor({
        trainingSessionId,
        eventId: generateId(),
        instructorId,
        reason,
        now: endedAt,
      });
    } catch (error) {
      if (!(error instanceof ScenarioEngineError)) throw error;
    }

    const cancelled = await this.training.finishAttempt(
      trainingSessionId,
      "cancelled_by_instructor",
    );
    if (snapshot === null && !cancelled) {
      throw new AppConflictException(
        ErrorCodes.TRAINING_SESSION_NOT_ACTIVE,
        "The training session has already ended",
      );
    }

    if (client && state && state.sessionId === trainingSessionId) {
      this.stopTicking(state);
      this.abortListening(state);
      this.recorder.finishCall(trainingSessionId);
      await this.incidentCards.close(trainingSessionId);
      await this.cancelActiveRequest(client, state);
      if (snapshot !== null) {
        await this.sendEvent(client, state, {
          type: "call.ended",
          reason: "instructor",
          ...this.snapshotFields(snapshot),
        });
      }
      state.callStarted = false;
    }

    if (recoverable) {
      recoverable.state.callStarted = false;
      this.recorder.finishCall(trainingSessionId);
      await this.incidentCards.close(trainingSessionId);
    }

    this.sessionClients.delete(trainingSessionId);
    this.clearRecovery(trainingSessionId);
    this.clearPersistedRecoveryTimer(trainingSessionId);
    await this.training.auditInstructorEnd(
      instructorId,
      trainingSessionId,
      reason,
    );
    return endedAt;
  }

  /**
   * Оператор взял слово.
   *
   * Речь идёт через backend, а не напрямую в распознавание: только здесь она
   * попадает и в ход звонка, и в запись разговора. Сам открытый микрофон не
   * считается речью; ход начинается только после VAD-финала.
   */
  private async startListening(
    client: WebSocket,
    state: ConnectionState,
  ): Promise<void> {
    if (!state.callStarted) {
      await this.sendError(client, state, null, "call-state-invalid");

      return;
    }

    // Повторный старт заменяет прежний поток. Обычно клиент открывает микрофон
    // один раз после первой реплики и держит его до завершения звонка.
    this.abortListening(state);

    let stream: AsrStreamHandle;
    try {
      stream = await this.asr.open(OPERATOR_LANGUAGE);
    } catch (error) {
      this.logger.warn(
        `Could not open recognition for session ${state.sessionId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      await this.sendError(client, state, null, "listen-failed");

      return;
    }

    const listening: ListeningStream = {
      streamId: generateId(),
      stream,
      recording: this.recorder.openSegment({
        sessionId: state.sessionId,
        track: "operator",
        sampleRate: OPERATOR_SAMPLE_RATE,
      }),
    };
    state.listening = listening;
    stream.onTranscript((transcript) => {
      void this.handleContinuousTranscript(
        client,
        state,
        listening,
        transcript,
      ).catch((error: unknown) => {
        this.logger.warn(
          `Could not handle a VAD utterance in session ${state.sessionId}: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      });
    });

    await this.sendEvent(client, state, {
      type: "listen.started",
      streamId: listening.streamId,
      sampleRate: OPERATOR_SAMPLE_RATE,
      channels: 1,
      format: "pcm_s16le",
    });
  }

  /**
   * Silero VAD закончил реплику, но микрофон и ASR-сокет остаются открытыми.
   * Новая реплика во время ответа заявителя становится естественным barge-in:
   * startRequest отменит прежний TTS и начнёт ответ на свежий вопрос.
   */
  private async handleContinuousTranscript(
    client: WebSocket,
    state: ConnectionState,
    listening: ListeningStream,
    transcript: AsrTranscript,
  ): Promise<void> {
    if (state.listening !== listening || !state.callStarted) {
      return;
    }

    await this.sendEvent(client, state, {
      type: "listen.transcript",
      streamId: listening.streamId,
      transcript: transcript.transcript.slice(0, MAX_TRANSCRIPT_CHARACTERS),
      audioMs: transcript.audioMs,
      processingMs: transcript.processingMs,
    });

    const operatorText = transcript.transcript
      .trim()
      .slice(0, MAX_UTTERANCE_CHARACTERS);
    if (operatorText.length === 0) {
      return;
    }

    await this.startRequest(
      client,
      state,
      { type: "speak", operatorText },
      false,
      performance.now(),
    );
  }

  /**
   * Оператор договорил: дожидаемся расшифровки и делаем ход за неё.
   *
   * Ход делает сервер, а не клиент отдельной командой speak: тогда между
   * распознанной речью и ходом звонка помещался бы чужой текст.
   */
  private async stopListening(
    client: WebSocket,
    state: ConnectionState,
  ): Promise<void> {
    const listening = state.listening;

    if (listening === null) {
      await this.sendError(client, state, null, "call-state-invalid");

      return;
    }

    state.listening = null;
    listening.recording.close();
    // Явная остановка используется при mute/end и досылает незавершённый хвост.
    const responseWaitingSince = performance.now();

    let transcript;
    try {
      transcript = await listening.stream.finish();
    } catch (error) {
      this.logger.warn(
        `Lost an operator utterance in session ${state.sessionId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      await this.releaseFloor(state);
      await this.sendError(client, state, null, "listen-failed");

      return;
    }

    await this.releaseFloor(state);
    await this.sendEvent(client, state, {
      type: "listen.stopped",
      streamId: listening.streamId,
      transcript: transcript.transcript.slice(0, MAX_TRANSCRIPT_CHARACTERS),
      audioMs: transcript.audioMs,
      processingMs: transcript.processingMs,
    });

    const operatorText = transcript.transcript
      .trim()
      .slice(0, MAX_UTTERANCE_CHARACTERS);

    // Оператор нажал и передумал, или в кадры попал один шум: хода нет, иначе
    // заявитель отвечал бы на пустоту.
    if (operatorText.length === 0) {
      return;
    }

    await this.startRequest(
      client,
      state,
      {
        type: "speak",
        operatorText,
      },
      false,
      responseWaitingSince,
    );
  }

  private handleAudioFrame(state: ConnectionState, data: RawData): void {
    const listening = state.listening;

    if (listening === null) {
      // Ошибку на каждый кадр слать нельзя: клиент шлёт их десятками в секунду,
      // и ответ на каждый превратился бы в поток ошибок.
      if (!state.strayAudioWarned) {
        state.strayAudioWarned = true;
        this.logger.warn(
          `Dropped audio sent outside a listen window in session ${state.sessionId}`,
        );
      }

      return;
    }

    const frame = this.toBytes(data);

    if (frame === null || frame.byteLength === 0) {
      return;
    }

    listening.stream.send(frame);
    listening.recording.write(frame);
  }

  private abortListening(state: ConnectionState): void {
    const listening = state.listening;

    if (listening === null) {
      return;
    }

    state.listening = null;
    listening.stream.abort();
    listening.recording.close();
  }

  /** Слово отдано обратно заявителю; сорваться на этом звонок не должен. */
  private async releaseFloor(state: ConnectionState): Promise<void> {
    try {
      await this.engine.setOperatorSpeaking({
        trainingSessionId: state.sessionId,
        speaking: false,
      });
    } catch (error) {
      this.logger.warn(
        `Could not resume the silence timer for session ${state.sessionId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  /**
   * Заявитель заговаривает сам, когда оператор молчит.
   *
   * Реплика идёт обычным ходом конвейера — перебивать оператора здесь нечем и
   * незачем: канал свободен. Если запрос уже выполняется, инициатива
   * пропускается, а не ставится в очередь: к моменту освобождения канала повод
   * молчать уже исчезнет.
   */
  private async speakOnInitiative(
    client: WebSocket,
    state: ConnectionState,
    directives: readonly { type: string }[],
  ): Promise<void> {
    const wanted = directives.some(
      (directive) => directive.type === "caller.initiative",
    );

    if (!wanted || state.activeRequest !== null) {
      return;
    }

    await this.startRequest(
      client,
      state,
      { type: "speak", operatorText: INITIATIVE_OPERATOR_TEXT },
      true,
    );
  }

  private snapshotFields(
    snapshot: CallSnapshot,
  ): Pick<
    CallSnapshot,
    | "stage"
    | "panicLevel"
    | "checklistTotal"
    | "checklistSatisfied"
    | "answerNormSeconds"
  > {
    return {
      stage: snapshot.stage,
      panicLevel: snapshot.panicLevel,
      checklistTotal: snapshot.checklistTotal,
      checklistSatisfied: snapshot.checklistSatisfied,
      answerNormSeconds: snapshot.answerNormSeconds,
    };
  }

  private async startRequest(
    client: WebSocket,
    state: ConnectionState,
    command: Extract<
      ReturnType<typeof VoicePipelineClientCommandSchema.parse>,
      { type: "speak" }
    >,
    initiative = false,
    responseWaitingSince = performance.now(),
  ): Promise<void> {
    await this.cancelActiveRequest(client, state);

    const activeRequest: ActiveRequest = {
      controller: new AbortController(),
      requestId: generateId(),
    };
    state.activeRequest = activeRequest;

    try {
      await this.engine.setCallerSpeaking({
        trainingSessionId: state.sessionId,
        speaking: true,
      });
    } catch {
      await this.sendError(
        client,
        state,
        activeRequest.requestId,
        "context-unavailable",
      );
      await this.releaseCallerFloor(state, activeRequest);
      return;
    }

    let request;
    try {
      request = await this.requestFactory.create({
        command,
        requestId: activeRequest.requestId,
        sessionId: state.sessionId,
        signal: activeRequest.controller.signal,
        initiative,
      });
    } catch {
      if (!activeRequest.controller.signal.aborted) {
        await this.sendError(
          client,
          state,
          activeRequest.requestId,
          "context-unavailable",
        );
      }
      await this.releaseCallerFloor(state, activeRequest);
      return;
    }

    if (!this.isCurrent(state, activeRequest)) {
      return;
    }

    let audioStarted = false;
    let recording: RecordingSegment | null = null;

    try {
      for await (const event of this.voicePipeline.streamReply(
        request,
        activeRequest.controller.signal,
        performance.now() - responseWaitingSince,
      )) {
        if (!this.isCurrent(state, activeRequest)) {
          return;
        }

        if (event.type === "voice.reply.ready") {
          // Факты возвращаются в источник истины до отправки: реплика, которая
          // раскрыла лишнее, не должна ни дойти до оператора, ни быть
          // озвученной.
          try {
            await this.requestFactory.recordReply({
              requestId: activeRequest.requestId,
              sessionId: state.sessionId,
              operatorText: command.operatorText,
              reply: event.result.reply,
              generation: {
                source: event.result.source,
                attempts: event.result.attempts,
                ...(event.result.resolution
                  ? { resolution: event.result.resolution }
                  : {}),
              },
              initiative,
            });
          } catch (error) {
            this.logger.warn(
              `Rejected a caller reply for session ${state.sessionId}: ${
                error instanceof Error ? error.message : "unknown error"
              }`,
            );
            activeRequest.controller.abort(
              new DOMException("Caller reply rejected", "AbortError"),
            );
            this.metrics.turnFailed("generated");
            await this.sendError(
              client,
              state,
              activeRequest.requestId,
              "pipeline-failed",
            );

            return;
          }

          this.metrics.callerReplyGenerated(event.result.source);
          await this.sendEvent(client, state, {
            type: "reply.text",
            requestId: activeRequest.requestId,
            ...event.result.reply,
            source: event.result.source,
            attempts: event.result.attempts,
            timeToReplyMs: event.timeToReplyMs,
          });
          continue;
        }

        if (event.type === "voice.audio.chunk") {
          if (!audioStarted) {
            audioStarted = true;
            recording = this.recorder.openSegment({
              sessionId: state.sessionId,
              track: "caller",
              sampleRate: event.chunk.sampleRate,
            });
            await this.sendEvent(client, state, {
              type: "audio.start",
              requestId: activeRequest.requestId,
              streamId: event.chunk.streamId,
              sampleRate: event.chunk.sampleRate,
              channels: event.chunk.channels,
              format: event.chunk.format,
            });
          }

          recording?.write(event.chunk.audio);
          await this.sendAudio(client, event.chunk.audio);
          continue;
        }

        this.metrics.turnCompleted(
          "generated",
          event.metrics.timeToFirstAudioMs,
        );
        await this.sendEvent(client, state, {
          type: "audio.done",
          requestId: activeRequest.requestId,
          metrics: event.metrics,
        });
      }
    } catch {
      if (
        !activeRequest.controller.signal.aborted &&
        this.isCurrent(state, activeRequest)
      ) {
        this.metrics.turnFailed("generated");
        await this.sendError(
          client,
          state,
          activeRequest.requestId,
          "pipeline-failed",
        );
      }
    } finally {
      // Прерванная реплика тоже слышна оператору, поэтому остаётся в записи.
      recording?.close();
      await this.releaseCallerFloor(state, activeRequest);
    }
  }

  /** Первая реплика задана сценарием и идёт сразу в TTS, минуя LLM. */
  private async startOpeningLine(
    client: WebSocket,
    state: ConnectionState,
    turn: EngineOpeningTurn,
  ): Promise<void> {
    await this.cancelActiveRequest(client, state);

    const activeRequest: ActiveRequest = {
      controller: new AbortController(),
      requestId: generateId(),
    };
    state.activeRequest = activeRequest;

    try {
      await this.engine.setCallerSpeaking({
        trainingSessionId: state.sessionId,
        speaking: true,
      });
    } catch {
      await this.sendError(
        client,
        state,
        activeRequest.requestId,
        "context-unavailable",
      );
      await this.releaseCallerFloor(state, activeRequest);
      return;
    }

    const startedAt = performance.now();
    let firstAudioAt: number | null = null;
    let audioStarted = false;
    let completed = false;
    let recording: RecordingSegment | null = null;

    try {
      for await (const event of this.voicePipeline.streamPrescribedSpeech(
        {
          requestId: activeRequest.requestId,
          sessionId: state.sessionId,
          text: turn.text,
          language: "Russian",
          voice: turn.voice,
          minimumResponseDelayMs: turn.minimumResponseDelayMs,
        },
        activeRequest.controller.signal,
      )) {
        if (!this.isCurrent(state, activeRequest)) {
          return;
        }

        if (completed) {
          throw new Error("Opening speech continued after completion");
        }

        if (event.type === "audio.chunk") {
          if (event.chunk.streamId !== activeRequest.requestId) {
            throw new Error("Opening speech returned another stream");
          }

          if (!audioStarted) {
            audioStarted = true;
            firstAudioAt = performance.now();
            recording = this.recorder.openSegment({
              sessionId: state.sessionId,
              track: "caller",
              sampleRate: event.chunk.sampleRate,
            });
            await this.sendEvent(client, state, {
              type: "audio.start",
              requestId: activeRequest.requestId,
              streamId: event.chunk.streamId,
              sampleRate: event.chunk.sampleRate,
              channels: event.chunk.channels,
              format: event.chunk.format,
            });
          }

          recording?.write(event.chunk.audio);
          await this.sendAudio(client, event.chunk.audio);
          continue;
        }

        if (!audioStarted || firstAudioAt === null) {
          throw new Error("Opening speech completed without audio");
        }

        completed = true;
        this.metrics.turnCompleted("prescribed", firstAudioAt - startedAt);
        await this.sendEvent(client, state, {
          type: "audio.done",
          requestId: activeRequest.requestId,
          metrics: {
            kind: "prescribed",
            minimumResponseDelayMs: turn.minimumResponseDelayMs,
            timeToFirstAudioMs: firstAudioAt - startedAt,
            durationMs: performance.now() - startedAt,
            synthesis: event.metrics,
          },
        });
      }

      if (!completed) {
        throw new Error("Opening speech ended without completion");
      }
    } catch {
      if (
        !activeRequest.controller.signal.aborted &&
        this.isCurrent(state, activeRequest)
      ) {
        this.metrics.turnFailed("prescribed");
        await this.sendError(
          client,
          state,
          activeRequest.requestId,
          "pipeline-failed",
        );
      }
    } finally {
      recording?.close();
      await this.releaseCallerFloor(state, activeRequest);
    }
  }

  private async releaseCallerFloor(
    state: ConnectionState,
    activeRequest: ActiveRequest,
  ): Promise<void> {
    if (!this.isCurrent(state, activeRequest)) {
      return;
    }

    try {
      await this.engine.setCallerSpeaking({
        trainingSessionId: state.sessionId,
        speaking: false,
      });
    } catch (error) {
      this.logger.warn(
        `Could not release the caller floor for session ${state.sessionId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    } finally {
      this.clearIfCurrent(state, activeRequest);
    }
  }

  private async cancelActiveRequest(
    client: WebSocket,
    state: ConnectionState,
  ): Promise<void> {
    const activeRequest = state.activeRequest;
    if (activeRequest === null) {
      return;
    }

    state.activeRequest = null;
    activeRequest.controller.abort(
      new DOMException("Voice pipeline request cancelled", "AbortError"),
    );

    // После явной отмены нового caller-turn может не быть. Старый async
    // generator уже не считается current и сам таймер не освободит.
    try {
      await this.engine.setCallerSpeaking({
        trainingSessionId: state.sessionId,
        speaking: false,
      });
    } catch (error) {
      this.logger.warn(
        `Could not release a cancelled caller turn for session ${state.sessionId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }

    await this.sendEvent(client, state, {
      type: "request.cancelled",
      requestId: activeRequest.requestId,
    });
  }

  private async sendError(
    client: WebSocket,
    state: ConnectionState,
    requestId: string | null,
    code: VoicePipelineSocketErrorCode,
  ): Promise<void> {
    const messages = {
      "invalid-message": "Invalid voice pipeline command",
      "context-unavailable": "Voice pipeline context is unavailable",
      "scenario-audio-not-ready":
        "Scenario audio must be prepared before an offline call",
      "pipeline-failed": "Voice pipeline request failed",
      "call-state-invalid": "The call is not in a state that allows this",
      "listen-failed": "The operator utterance was not recognised",
      "assignment-unavailable": "This assignment is not available",
      "assignment-attempts-exhausted":
        "Every attempt of this assignment has been used",
      "assignment-attempt-active": "Another training attempt is still active",
      "session-recovery-unavailable":
        "The training session can no longer be recovered",
    } as const satisfies Record<VoicePipelineSocketErrorCode, string>;

    await this.sendEvent(client, state, {
      type: "error",
      requestId,
      code,
      message: messages[code],
    });
  }

  private async sendEvent(
    client: WebSocket,
    state: ConnectionState,
    event: VoicePipelineServerEventInput,
  ): Promise<void> {
    const parsed = VoicePipelineServerEventSchema.parse({
      ...event,
      eventId: generateId(),
      sessionId: state.sessionId,
      timestamp: new Date().toISOString(),
    });

    await this.send(client, JSON.stringify(parsed));
  }

  private async sendAudio(client: WebSocket, audio: Uint8Array): Promise<void> {
    const buffer = Buffer.from(
      audio.buffer,
      audio.byteOffset,
      audio.byteLength,
    );
    await this.send(client, buffer, true);
  }

  private async send(
    client: WebSocket,
    data: string | Buffer,
    binary = false,
  ): Promise<void> {
    if (client.readyState !== WebSocket.OPEN) {
      return;
    }

    await new Promise<void>((resolve) => {
      // ws зовёт колбэк с null при успешной отправке, хотя тип обещает
      // undefined: проверка на undefined считала ошибкой каждый удачный кадр.
      client.send(data, { binary }, (error?: Error | null) => {
        if (error) {
          this.logger.warn(
            `Failed to send a voice pipeline WebSocket frame: ${error.message}`,
          );
        }
        resolve();
      });
    });
  }

  private toBytes(data: RawData): Uint8Array | null {
    if (Array.isArray(data)) {
      return Buffer.concat(data);
    }

    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }

    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }

    return null;
  }

  private decodeText(data: RawData): string | null {
    if (Array.isArray(data)) {
      return Buffer.concat(data).toString("utf8");
    }

    if (data instanceof ArrayBuffer) {
      return Buffer.from(data).toString("utf8");
    }

    if (ArrayBuffer.isView(data)) {
      return Buffer.from(
        data.buffer,
        data.byteOffset,
        data.byteLength,
      ).toString("utf8");
    }

    return null;
  }

  private isCurrent(state: ConnectionState, request: ActiveRequest): boolean {
    return state.activeRequest === request;
  }

  private clearIfCurrent(state: ConnectionState, request: ActiveRequest): void {
    if (this.isCurrent(state, request)) {
      state.activeRequest = null;
    }
  }
}
