import { Injectable, ServiceUnavailableException } from "@nestjs/common";

import { env } from "@/core/config/env.config";

export interface AsrHealth {
  status: string;
  model: string;
  device: string;
  flashAttention: boolean;
}

export interface AsrSession {
  sessionId: string;
  wsUrl: string;
  sampleRate: number;
  expiresInSeconds: number;
  model: string;
}

@Injectable()
export class AsrService {
  private readonly serviceUrl: string;

  constructor() {
    this.serviceUrl = env.ASR_SERVICE_URL.replace(/\/$/, "");
  }

  health(): Promise<AsrHealth> {
    return this.request<AsrHealth>("/health");
  }

  createSession(language: string): Promise<AsrSession> {
    return this.request<AsrSession>("/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ language }),
    });
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    try {
      const response = await fetch(`${this.serviceUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        const details = await response.text();
        throw new Error(`HTTP ${response.status}: ${details}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(
        `ASR service is unavailable: ${reason}`,
      );
    }
  }
}
