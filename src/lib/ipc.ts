import { Channel, invoke } from "@tauri-apps/api/core";

import { IPC_CONFIG } from "../config/ipc";
import type { CallClientCommand } from "../contracts/call";

interface CallConnectOptions extends Record<string, unknown> {
  url: string;
  token: string;
  onEvent: Channel<unknown>;
  onAudio: Channel<ArrayBuffer>;
}

interface SystemAudioCaptureOptions {
  loopback?: boolean;
  processing?: boolean;
  levelOnly?: boolean;
}

export type MicrophonePermissionStatus = "allowed" | "denied" | "unknown";

/** Типизированные вызовы нативного Tauri API. */
export const ipc = {
  call: {
    connect(options: CallConnectOptions): Promise<string> {
      return invoke(IPC_CONFIG.getCallConnectHandler(), options);
    },

    send(connection: string, command: CallClientCommand): Promise<void> {
      return invoke(IPC_CONFIG.getCallSendHandler(), { connection, command });
    },

    attachMicrophoneChannel(
      connection: string,
      channelId: number,
    ): Promise<void> {
      return invoke(IPC_CONFIG.getCallAttachMicrophoneChannelHandler(), {
        connection,
        channelId,
      });
    },

    startListening(connection: string): Promise<void> {
      return invoke(IPC_CONFIG.getCallListenStartHandler(), { connection });
    },

    stopListening(connection: string): Promise<void> {
      return invoke(IPC_CONFIG.getCallListenStopHandler(), { connection });
    },

    disconnect(connection: string): Promise<void> {
      return invoke(IPC_CONFIG.getCallDisconnectHandler(), { connection });
    },
  },

  systemAudio: {
    start(
      channel: Channel<unknown>,
      options?: SystemAudioCaptureOptions,
    ): Promise<void> {
      return invoke(IPC_CONFIG.getSystemAudioStartHandler(), {
        channel,
        options,
      });
    },

    stop(): Promise<void> {
      return invoke(IPC_CONFIG.getSystemAudioStopHandler());
    },

    permissionStatus(): Promise<MicrophonePermissionStatus> {
      return invoke(IPC_CONFIG.getSystemAudioPermissionStatusHandler());
    },
  },
} as const;
