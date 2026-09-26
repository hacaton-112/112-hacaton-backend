export type MicrophonePermissionStatus = "allowed" | "denied" | "unknown";

export async function microphonePermissionStatus(): Promise<MicrophonePermissionStatus> {
  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return status.state === "granted"
      ? "allowed"
      : status.state === "denied"
        ? "denied"
        : "unknown";
  } catch {
    return "unknown";
  }
}

/** Opens and immediately releases the microphone to obtain site permission. */
export async function requestMicrophoneAccess(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => track.stop());
}
