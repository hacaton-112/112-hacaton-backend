import type { IncomingMessage } from "node:http";

import { Inject, Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from "@nestjs/websockets";
import WebSocket, { type RawData } from "ws";

import {
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
} from "@/modules/asr/asr-stream.port";
import { AccessTokenVerifier } from "@/modules/auth/access-token.verifier";
import type { VerifiedJwtPayload } from "@/modules/auth/dto/jwt-payload.dto";
import {
  INITIATIVE_OPERATOR_TEXT,
  ScenarioEngineError,
  ScenarioEngineService,
  type CallSnapshot,
} from "@/modules/scenario-engine";

import { VoicePipelineService } from "../../application/voice-pipeline.service";
import type { VoicePipelineRequestFactory } from "../../application/voice-pipeline-request.factory";
import { VOICE_PIPELINE_REQUEST_FACTORY } from "../../voice-pipeline.tokens";

const MAX_COMMAND_BYTES = 16_384;
/**
 * Как часто сервер двигает звонок сам. Секунда — компромисс: пороги молчания в
 * сценариях задаются секундами, а более частый опрос упирался бы в базу без
 * пользы для слуха оператора.
 */
const TICK_INTERVAL_MS = 1_000;
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
/** Application-level close code mirroring HTTP 401. */
const UNAUTHORIZED_CLOSE_CODE = 4401;
const GATEWAY_PATH = "/api/v1/voice-pipeline/stream";

interface ActiveRequest {
  controller: AbortController;
  requestId: string;
}

/** Открытое окно, пока оператор говорит: одна реплика — один поток. */
interface ListeningStream {
  streamId: string;
  stream: AsrStreamHandle;
}

interface ConnectionState {
  activeRequest: ActiveRequest | null;
  /** Идентификатор учебной сессии; появляется только после команды start. */
  sessionId: string;
  callStarted: boolean;
  timer: NodeJS.Timeout | null;
  /** Последний отправленный снимок: событие идёт только при изменении. */
  lastSnapshotKey: string | null;
  listening: ListeningStream | null;
  /** Про звук вне окна предупреждаем один раз, а не на каждом кадре. */
  strayAudioWarned: boolean;
  user: VerifiedJwtPayload;
}

type WithoutEventMetadata<T> = T extends unknown
  ? Omit<T, "eventId" | "sessionId" | "timestamp">
  : never;

type VoicePipelineServerEventInput =
  WithoutEventMetadata<VoicePipelineServerEvent>;

@WebSocketGateway({ path: GATEWAY_PATH, maxPayload: MAX_COMMAND_BYTES })
export class VoicePipelineGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(VoicePipelineGateway.name);
  private readonly connections = new WeakMap<WebSocket, ConnectionState>();

  constructor(
    private readonly voicePipeline: VoicePipelineService,
    @Inject(VOICE_PIPELINE_REQUEST_FACTORY)
    private readonly requestFactory: VoicePipelineRequestFactory,
    private readonly accessTokenVerifier: AccessTokenVerifier,
    private readonly engine: ScenarioEngineService,
    @Inject(ASR_STREAMER)
    private readonly asr: AsrStreamer,
  ) {}

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
      request?.headers.authorization,
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
      lastSnapshotKey: null,
      listening: null,
      strayAudioWarned: false,
      user,
    });

    client.on("message", (data, isBinary) => {
      void this.handleClientMessage(client, data, isBinary);
    });
  }

  handleDisconnect(client: WebSocket): void {
    const state = this.connections.get(client);

    if (state !== undefined) {
      this.stopTicking(state);
      this.abortListening(state);
    }

    state?.activeRequest?.controller.abort(
      new DOMException("WebSocket disconnected", "AbortError"),
    );
    this.connections.delete(client);
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

  /** Команды жизненного цикла звонка идут прямо в движок сценария. */
  private async handleCallCommand(
    client: WebSocket,
    state: ConnectionState,
    command: Exclude<
      VoicePipelineClientCommand,
      { type: "speak" } | { type: "cancel" } | { type: `listen.${string}` }
    >,
  ): Promise<void> {
    try {
      if (command.type === "start") {
        const snapshot = await this.engine.startCall({
          trainingSessionId: state.sessionId,
          scenarioVersionId: command.scenarioVersionId,
          eventId: generateId(),
        });
        state.callStarted = true;

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

        this.startTicking(client, state);

        await this.sendEvent(client, state, {
          type: "call.accepted",
          openingLine: snapshot.openingLine,
          ...this.snapshotFields(snapshot),
        });

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

      this.stopTicking(state);
      this.abortListening(state);
      await this.cancelActiveRequest(client, state);
      await this.sendEvent(client, state, {
        type: "call.ended",
        reason: command.type === "decline" ? "declined" : "operator",
        ...this.snapshotFields(snapshot),
      });
    } catch (error) {
      this.logger.warn(
        `Rejected ${command.type} for session ${state.sessionId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      await this.sendError(
        client,
        state,
        null,
        error instanceof ScenarioEngineError
          ? "call-state-invalid"
          : "context-unavailable",
      );
    }
  }

  /**
   * Оператор взял слово.
   *
   * Речь идёт через backend, а не напрямую в распознавание: только здесь она
   * попадает и в ход звонка, и в запись разговора. Пока окно открыто, отсчёт
   * молчания стоит — иначе заявитель заговорил бы поверх вопроса, которого
   * сервер ещё не расслышал.
   */
  private async startListening(
    client: WebSocket,
    state: ConnectionState,
  ): Promise<void> {
    if (!state.callStarted) {
      await this.sendError(client, state, null, "call-state-invalid");

      return;
    }

    // Второй listen.start без stop — оператор передумал: начатую реплику
    // бросаем, дослушивать её уже некому.
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

    const listening: ListeningStream = { streamId: generateId(), stream };
    state.listening = listening;

    try {
      await this.engine.setOperatorSpeaking({
        trainingSessionId: state.sessionId,
        speaking: true,
      });
    } catch {
      this.abortListening(state);
      await this.sendError(client, state, null, "context-unavailable");

      return;
    }

    await this.sendEvent(client, state, {
      type: "listen.started",
      streamId: listening.streamId,
      sampleRate: OPERATOR_SAMPLE_RATE,
      channels: 1,
      format: "pcm_s16le",
    });
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
      transcript: transcript.transcript,
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

    await this.startRequest(client, state, {
      type: "speak",
      operatorText,
    });
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
  }

  private abortListening(state: ConnectionState): void {
    const listening = state.listening;

    if (listening === null) {
      return;
    }

    state.listening = null;
    listening.stream.abort();
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
  ): Promise<void> {
    await this.cancelActiveRequest(client, state);

    const activeRequest: ActiveRequest = {
      controller: new AbortController(),
      requestId: generateId(),
    };
    state.activeRequest = activeRequest;

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
      this.clearIfCurrent(state, activeRequest);
      return;
    }

    if (!this.isCurrent(state, activeRequest)) {
      return;
    }

    let audioStarted = false;

    try {
      for await (const event of this.voicePipeline.streamReply(
        request,
        activeRequest.controller.signal,
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
            await this.sendError(
              client,
              state,
              activeRequest.requestId,
              "pipeline-failed",
            );
            this.clearIfCurrent(state, activeRequest);

            return;
          }

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
            await this.sendEvent(client, state, {
              type: "audio.start",
              requestId: activeRequest.requestId,
              streamId: event.chunk.streamId,
              sampleRate: event.chunk.sampleRate,
              channels: event.chunk.channels,
              format: event.chunk.format,
            });
          }

          await this.sendAudio(client, event.chunk.audio);
          continue;
        }

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
        await this.sendError(
          client,
          state,
          activeRequest.requestId,
          "pipeline-failed",
        );
      }
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
      "pipeline-failed": "Voice pipeline request failed",
      "call-state-invalid": "The call is not in a state that allows this",
      "listen-failed": "The operator utterance was not recognised",
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
      client.send(data, { binary }, (error) => {
        if (error !== undefined) {
          this.logger.warn("Failed to send a voice pipeline WebSocket frame");
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
