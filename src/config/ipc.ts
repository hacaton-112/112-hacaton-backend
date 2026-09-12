/** Имена Tauri-команд. Вызовы и их типы находятся в `lib/ipc.ts`. */
export const IPC_CONFIG = {
  getCallConnectHandler: () => "call_connect",
  getCallStartHandler: () => "call_start",
  getCallSendHandler: () => "call_send",
  getCallAttachMicrophoneChannelHandler: () => "call_attach_microphone_channel",
  getCallListenStartHandler: () => "call_listen_start",
  getCallListenStopHandler: () => "call_listen_stop",
  getCallDisconnectHandler: () => "call_disconnect",
  getSystemAudioStartHandler: () => "plugin:system-audio|start",
  getSystemAudioStopHandler: () => "plugin:system-audio|stop",
  getSystemAudioPermissionStatusHandler: () =>
    "plugin:system-audio|permission_status",
} as const;
