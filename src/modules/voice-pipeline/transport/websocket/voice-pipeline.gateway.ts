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
  type VoicePipelineServerEvent,
  type VoicePipelineSocketErrorCode,
} from "@/contracts";
import { generateId } from "@/common/utils/id";

import { VoicePipelineService } from "../../application/voice-pipeline.service";
import type { VoicePipelineRequestFactory } from "../../application/voice-pipeline-request.factory";
import { VOICE_PIPELINE_REQUEST_FACTORY } from "../../voice-pipeline.tokens";

const MAX_COMMAND_BYTES = 16_384;
const GATEWAY_PATH = "/api/v1/voice-pipeline/stream";

interface ActiveRequest {
  controller: AbortController;
  requestId: string;
}

interface ConnectionState {
  activeRequest: ActiveRequest | null;
  sessionId: string;
}

type WithoutEventMetadata<T> = T extends unknown
  ? Omit<T, "eventId" | "sessionId" | "timestamp">
  : never;

type VoicePipelineServerEventInput =
  WithoutEventMetadata<VoicePipelineServerEvent>;

@WebSocketGateway({ path: GATEWAY_PATH })
export class VoicePipelineGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(VoicePipelineGateway.name);
  private readonly connections = new WeakMap<WebSocket, ConnectionState>();

  constructor(
    private readonly voicePipeline: VoicePipelineService,
    @Inject(VOICE_PIPELINE_REQUEST_FACTORY)
    private readonly requestFactory: VoicePipelineRequestFactory,
  ) {}

  handleConnection(client: WebSocket): void {
    this.connections.set(client, {
      activeRequest: null,
      sessionId: generateId(),
    });

    client.on("message", (data, isBinary) => {
      void this.handleClientMessage(client, data, isBinary);
    });
  }

  handleDisconnect(client: WebSocket): void {
    const state = this.connections.get(client);
    state?.activeRequest?.controller.abort(
      new DOMException("WebSocket disconnected", "AbortError"),
    );
    this.connections.delete(client);
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
      await this.sendError(client, state, null, "invalid-message");
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

    await this.startRequest(client, state, parsed.data);
  }

  private async startRequest(
    client: WebSocket,
    state: ConnectionState,
    command: Extract<
      ReturnType<typeof VoicePipelineClientCommandSchema.parse>,
      { type: "speak" }
    >,
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
