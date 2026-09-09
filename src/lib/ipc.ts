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
    connect(options: CallConnectOptions): Promise<void> {
      return invoke(IPC_CONFIG.getCallConnectHandler(), options);
    },

    send(command: CallClientCommand): Promise<void> {
      return invoke(IPC_CONFIG.getCallSendHandler(), { command });
    },

    attachMicrophoneChannel(channelId: number): Promise<void> {
      return invoke(IPC_CONFIG.getCallAttachMicrophoneChannelHandler(), {
        channelId,
      });
    },

    startListening(): Promise<void> {
      return invoke(IPC_CONFIG.getCallListenStartHandler());
    },

    stopListening(): Promise<void> {
      return invoke(IPC_CONFIG.getCallListenStopHandler());
    },

    disconnect(): Promise<void> {
      return invoke(IPC_CONFIG.getCallDisconnectHandler());
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
