import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { offlineSettings } from "@/modules/ai-gateway/domain/offline-policy";

@Injectable()
export class VoiceRuntimeService {
  readonly settings;
  private readonly outcomes: Record<string, number> = {};
  constructor(config: ConfigService) {
    this.settings = offlineSettings(config);
    if (
      this.settings.enabled &&
      config.get("VOICE_PIPELINE_DEMO_ENABLED") === "true"
    )
      throw new Error("Offline profile cannot use the demo request factory");
  }
  record(outcome: string): void {
    this.outcomes[outcome] = (this.outcomes[outcome] ?? 0) + 1;
  }
  snapshot() {
    return {
      profile: this.settings.enabled ? "offline-hybrid" : "standard",
      exceptionBudgetMs: this.settings.budgetMs,
      outcomes: { ...this.outcomes },
      scope: "backend-process",
      dynamicAudioBuffered: this.settings.enabled,
    };
  }
}
