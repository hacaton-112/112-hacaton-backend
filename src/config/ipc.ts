/** Имена Tauri-команд. Вызовы и их типы находятся в `lib/ipc.ts`. */
export const IPC_CONFIG = {
  getCallConnectHandler: () => "call_connect",
  getCallStartHandler: () => "call_start",
  getCallSendHandler: () => "call_send",
  getCallAttachMicrophoneChannelHandler: () => "call_attach_microphone_channel",
  getCallListenStartHandler: () => "call_listen_start",
  getCallListenStopHandler: () => "call_listen_stop",
  getCallDisconnectHandler: () => "call_disconnect",
  getSystemAudioStartHandler: () => "audio_capture_start",
  getSystemAudioStopHandler: () => "audio_capture_stop",
  getSystemAudioPermissionStatusHandler: () =>
    "plugin:system-audio|permission_status",
  getAudioDevicesHandler: () => "audio_devices",
  getAudioSetInputGainHandler: () => "audio_set_input_gain",
  getAudioSetOutputVolumeHandler: () => "audio_set_output_volume",
  getAudioTestStartHandler: () => "audio_test_start",
  getAudioTestStopHandler: () => "audio_test_stop",
} as const;
