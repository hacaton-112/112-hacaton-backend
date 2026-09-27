import type { IncomingMessage } from "node:http";

import { Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from "@nestjs/websockets";
import WebSocket, { type RawData } from "ws";

import { generateId } from "@/common/utils/id";
import { websocketAuthorization } from "@/core/http/websocket-authorization";
import { AccessTokenVerifier } from "@/modules/auth/infrastructure/access-token.verifier";

import { DirectCrewCallService } from "../../application/direct-crew-call.service";
import {
  DirectCrewCallClientCommandSchema,
  DirectCrewCallServerEventSchema,
  type DirectCrewCallServerEventInput,
} from "../../dto/direct-crew-call.dto";

const GATEWAY_PATH = "/api/v1/telephony/direct-crew-calls/stream";
const MAX_FRAME_BYTES = 128 * 1024;
const UNAUTHORIZED_CLOSE_CODE = 4401;
const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_SEEN_EVENT_IDS = 256;

interface ConnectionState {
  readonly sessionId: string;
  readonly operatorId: string;
  activeChannelId: string | null;
  alive: boolean;
  heartbeat: ReturnType<typeof setInterval> | null;
  readonly seenEventIds: Set<string>;
}

@WebSocketGateway({ path: GATEWAY_PATH, maxPayload: MAX_FRAME_BYTES })
export class DirectCrewCallGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(DirectCrewCallGateway.name);
  private readonly connections = new WeakMap<WebSocket, ConnectionState>();

  constructor(
    private readonly accessTokenVerifier: AccessTokenVerifier,
    private readonly calls: DirectCrewCallService,
  ) {}

  async handleConnection(
    client: WebSocket,
    request?: IncomingMessage,
  ): Promise<void> {
    const user = await this.accessTokenVerifier.verify(
      websocketAuthorization(request),
    );
    if (user === null || user.role !== "operator") {
      client.close(UNAUTHORIZED_CLOSE_CODE, "Unauthorized");
      return;
    }

    const state: ConnectionState = {
      sessionId: generateId(),
      operatorId: user.sub,
      activeChannelId: null,
      alive: true,
      heartbeat: null,
      seenEventIds: new Set(),
    };
    this.connections.set(client, state);

    client.on("message", (data, isBinary) => {
      if (isBinary) {
        const bytes = this.toBytes(data);
        if (bytes && state.activeChannelId) {
          this.calls.audio(state.activeChannelId, bytes);
        }
        return;
      }
      void this.handleCommand(client, state, data);
    });
    client.on("pong", () => {
      state.alive = true;
    });
    state.heartbeat = setInterval(() => {
      if (!state.alive) {
        client.terminate();
        return;
      }
      state.alive = false;
      client.ping();
    }, HEARTBEAT_INTERVAL_MS);
    state.heartbeat.unref?.();

    await this.sendEvent(client, state, { type: "socket.ready" });
  }

  async handleDisconnect(client: WebSocket): Promise<void> {
    const state = this.connections.get(client);
    if (!state) return;
    if (state.heartbeat) clearInterval(state.heartbeat);
    if (state.activeChannelId) await this.calls.end(state.activeChannelId);
  }

  private async handleCommand(
    client: WebSocket,
    state: ConnectionState,
    data: RawData,
  ): Promise<void> {
    let payload: unknown;
    try {
      payload = JSON.parse(this.toText(data));
    } catch {
      await this.sendError(client, state, "invalid-command", "Некорректная команда телефона");
      return;
    }

    const parsed = DirectCrewCallClientCommandSchema.safeParse(payload);
    if (!parsed.success) {
      await this.sendError(client, state, "invalid-command", "Некорректная команда телефона");
      return;
    }
    if (state.seenEventIds.has(parsed.data.eventId)) return;
    state.seenEventIds.add(parsed.data.eventId);
    if (state.seenEventIds.size > MAX_SEEN_EVENT_IDS) {
      const oldest = state.seenEventIds.values().next().value;
      if (oldest) state.seenEventIds.delete(oldest);
    }

    switch (parsed.data.type) {
      case "start": {
        if (state.activeChannelId) {
          await this.sendError(
            client,
            state,
            "call-already-started",
            "Предыдущий разговор ещё не завершён",
          );
          return;
        }
        const channelId = `browser-${generateId()}`;
        state.activeChannelId = channelId;
        await this.calls.start({
          channelId,
          operatorId: state.operatorId,
          exerciseId: parsed.data.exerciseId,
          dialedNumber: parsed.data.dialedNumber,
          transport: {
            emit: async (event) => {
              await this.sendEvent(client, state, event);
              if (event.type === "call.ended") state.activeChannelId = null;
            },
            sendAudio: (audio) => this.sendAudio(client, audio),
          },
        });
        return;
      }
      case "prompt.played":
        if (!state.activeChannelId) {
          await this.sendError(
            client,
            state,
            "call-not-started",
            "Разговор уже завершён",
          );
          return;
        }
        this.calls.promptPlayed(
          state.activeChannelId,
          parsed.data.promptId,
        );
        return;
      case "end":
        if (!state.activeChannelId) return;
        await this.calls.end(state.activeChannelId);
        state.activeChannelId = null;
        return;
    }
  }

  private sendError(
    client: WebSocket,
    state: ConnectionState,
    code:
      | "invalid-command"
      | "call-already-started"
      | "call-not-started"
      | "call-failed",
    message: string,
  ): Promise<void> {
    this.logger.warn(`Direct DDS phone command rejected: ${code}`);
    return this.sendEvent(client, state, { type: "error", code, message });
  }

  private async sendEvent(
    client: WebSocket,
    state: ConnectionState,
    event: DirectCrewCallServerEventInput,
  ): Promise<void> {
    const parsed = DirectCrewCallServerEventSchema.parse({
      ...event,
      eventId: generateId(),
      sessionId: state.sessionId,
      timestamp: new Date().toISOString(),
    });
    await this.send(client, JSON.stringify(parsed));
  }

  private sendAudio(client: WebSocket, audio: Uint8Array): Promise<void> {
    return this.send(
      client,
      Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength),
      true,
    );
  }

  private async send(
    client: WebSocket,
    data: string | Buffer,
    binary = false,
  ): Promise<void> {
    if (client.readyState !== WebSocket.OPEN) return;
    await new Promise<void>((resolve) => {
      client.send(data, { binary }, (error?: Error | null) => {
        if (error) {
          this.logger.warn(`Direct DDS phone send failed: ${error.message}`);
        }
        resolve();
      });
    });
  }

  private toText(data: RawData): string {
    if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString(
      "utf8",
    );
  }

  private toBytes(data: RawData): Uint8Array | null {
    if (Array.isArray(data)) return Buffer.concat(data);
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
}
