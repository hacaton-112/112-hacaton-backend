import { Web } from "sip.js";

import type { BrowserPhoneConfig } from "../contracts/telephony";
import { requestMicrophoneAccess } from "../lib/media-permissions";

export interface BrowserPhoneEvents {
  onRegistered(): void;
  onIncomingCall(): void;
  onCallAnswered(): void;
  onCallEnded(): void;
  onDisconnected(error?: Error): void;
}

type AnswerablePhone = Pick<Web.SimpleUser, "answer">;

/**
 * Requests the browser permission before SIP.js starts accepting the INVITE.
 *
 * SIP.js moves an invitation to `Establishing` before it calls getUserMedia.
 * If that call is denied, the library has to terminate the invitation. Asking
 * first keeps the incoming call intact so the operator can allow the
 * microphone and press «Ответить» again.
 */
export async function answerBrowserPhone(
  phone: AnswerablePhone,
  requestAccess: () => Promise<void> = requestMicrophoneAccess,
): Promise<void> {
  await requestAccess();
  await phone.answer();
}

/** Thin adapter around SIP.js so the React window owns presentation only. */
export class BrowserPhoneClient {
  private readonly phone: Web.SimpleUser;
  private disposed = false;

  constructor(
    config: BrowserPhoneConfig,
    remoteAudio: HTMLAudioElement,
    events: BrowserPhoneEvents,
  ) {
    this.phone = new Web.SimpleUser(config.websocketUrl, {
      aor: config.aor,
      media: {
        constraints: { audio: true, video: false },
        remote: { audio: remoteAudio },
      },
      reconnectionAttempts: 3,
      reconnectionDelay: 2,
      userAgentOptions: {
        authorizationUsername: config.authorizationUsername,
        authorizationPassword: config.authorizationPassword,
        displayName: config.displayName,
        logLevel: "error",
      },
      delegate: {
        onRegistered: () => events.onRegistered(),
        onCallReceived: () => events.onIncomingCall(),
        onCallAnswered: () => events.onCallAnswered(),
        onCallHangup: () => events.onCallEnded(),
        onServerDisconnect: (error) => {
          if (!this.disposed) events.onDisconnected(error);
        },
      },
    });
  }

  async connect(): Promise<void> {
    await this.phone.connect();
    await this.phone.register();
  }

  answer(): Promise<void> {
    return answerBrowserPhone(this.phone);
  }

  decline(): Promise<void> {
    return this.phone.decline();
  }

  hangup(): Promise<void> {
    return this.phone.hangup();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    try {
      await this.phone.unregister();
    } catch {
      // A disconnected PBX cannot accept UNREGISTER; disconnect still frees media.
    }
    await this.phone.disconnect();
  }
}
