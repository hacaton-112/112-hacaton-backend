import { Channel, invoke } from "@tauri-apps/api/core";

import { IPC_CONFIG } from "../config/ipc";
import type { CallClientCommand } from "../contracts/call";

interface CallConnectOptions extends Record<string, unknown> {
  url: string;
  token: string;
  onEvent: Channel<unknown>;
  outputDevice?: string | null;
}

interface SystemAudioCaptureOptions {
  loopback?: boolean;
  processing?: boolean;
  levelOnly?: boolean;
  inputDevice?: string | null;
  inputGain?: number;
}

interface MicrophoneTestOptions {
  inputDevice: string | null;
  inputGain: number;
  outputDevice: string | null;
  outputVolume: number;
}

export interface AudioDeviceInfo {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface AudioDeviceCatalog {
  inputs: AudioDeviceInfo[];
  outputs: AudioDeviceInfo[];
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

    start(
      connection: string,
      scenarioVersionId: string,
      scenarioCategory: string,
      assignmentId?: string,
    ): Promise<void> {
      return invoke(IPC_CONFIG.getCallStartHandler(), {
        connection,
        scenarioVersionId,
        scenarioCategory,
        assignmentId,
      });
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
    /** `levels` получает уровень речи для индикатора, без самого звука. */
    start(
      channel: Channel<unknown>,
      options: SystemAudioCaptureOptions,
      levels: Channel<unknown>,
    ): Promise<void> {
      return invoke(IPC_CONFIG.getSystemAudioStartHandler(), {
        channel,
        levels,
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

  audio: {
    devices(): Promise<AudioDeviceCatalog> {
      return invoke(IPC_CONFIG.getAudioDevicesHandler());
    },

    /** Меняет усиление сразу — и в звонке, и в идущей проверке. */
    setInputGain(gain: number): Promise<void> {
      return invoke(IPC_CONFIG.getAudioSetInputGainHandler(), { gain });
    },

    setOutputVolume(volume: number): Promise<void> {
      return invoke(IPC_CONFIG.getAudioSetOutputVolumeHandler(), { volume });
    },

    startTest(
      channel: Channel<unknown>,
      options: MicrophoneTestOptions,
    ): Promise<void> {
      return invoke(IPC_CONFIG.getAudioTestStartHandler(), {
        channel,
        options,
      });
    },

    stopTest(): Promise<void> {
      return invoke(IPC_CONFIG.getAudioTestStopHandler());
    },
  },
} as const;
