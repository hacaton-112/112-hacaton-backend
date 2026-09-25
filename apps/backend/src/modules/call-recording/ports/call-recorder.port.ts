export type RecordingTrack = "operator" | "caller";

/**
 * Один непрерывный кусок звука: реплика оператора или ответ заявителя.
 *
 * Методы ничего не возвращают и не бросают: запись — это побочная польза от
 * звонка, и разговор не должен обрываться из-за недоступного хранилища.
 */
export interface RecordingSegment {
  write(pcm: Uint8Array): void;
  close(): void;
}

export interface CallRecorder {
  startCall(sessionId: string): void;

  /** Продолжает запись после рестарта процесса, не сбрасывая живой recorder. */
  resumeCall(sessionId: string, startedAt: Date): void;

  openSegment(input: {
    sessionId: string;
    track: RecordingTrack;
    sampleRate: number;
  }): RecordingSegment;

  finishCall(sessionId: string): void;
}
