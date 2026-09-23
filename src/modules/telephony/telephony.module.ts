import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { AuthModule } from "@/modules/auth/auth.module";
import { AsrModule } from "@/modules/asr/asr.module";
import { DdsExerciseModule } from "@/modules/dds-exercise";
import { DdsExerciseService } from "@/modules/dds-exercise/application/dds-exercise.service";
import {
  SpeechSynthesisModule,
  SpeechSynthesisService,
} from "@/modules/speech-synthesis";

import {
  AWAITING_HANDOFF,
  CREW_HANDOFF_DIRECTORY,
  CREW_PROMPT_SOURCE,
  CrewHandoffService,
  TELEPHONY_ENABLED,
} from "./application/crew-handoff.service";
import { BrowserPhoneProvisioningService } from "./application/browser-phone-provisioning.service";
import { CrewClickToCallService } from "./application/crew-click-to-call.service";
import { AriTelephonyControl } from "./infrastructure/ari-telephony.control";
import { DrizzleTelephonyDirectory } from "./infrastructure/drizzle-telephony.directory";
import { FileCrewPromptStore } from "./infrastructure/file-crew-prompt.store";
import {
  parseTelephonyConfig,
  TELEPHONY_CONFIG,
  TELEPHONY_ENVIRONMENT_KEYS,
  type TelephonyConfig,
} from "./infrastructure/telephony.config";
import { TELEPHONY_CONTROL } from "./ports/telephony-control.port";
import { TelephonyController } from "./telephony.controller";

/**
 * Учебная IP-телефония: диспетчер ДДС передаёт карточку наряду по SIP.
 *
 * Asterisk отдаёт звонки приложению Stasis, а этот модуль играет наряд на
 * том конце. Без `TELEPHONY_ENABLED` модуль не подключается к АТС, и рабочее
 * место ДДС работает без шага передачи наряду.
 */
@Module({
  imports: [
    AuthModule,
    AsrModule,
    ConfigModule,
    DdsExerciseModule,
    SpeechSynthesisModule,
  ],
  controllers: [TelephonyController],
  providers: [
    {
      provide: TELEPHONY_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        parseTelephonyConfig(
          Object.fromEntries(
            TELEPHONY_ENVIRONMENT_KEYS.map((key) => [key, config.get(key)]),
          ),
        ),
    },
    {
      provide: TELEPHONY_ENABLED,
      inject: [TELEPHONY_CONFIG],
      useFactory: (config: TelephonyConfig) => config.enabled,
    },
    {
      provide: TELEPHONY_CONTROL,
      inject: [TELEPHONY_CONFIG],
      useFactory: (config: TelephonyConfig) =>
        new AriTelephonyControl(config.ari),
    },
    DrizzleTelephonyDirectory,
    { provide: CREW_HANDOFF_DIRECTORY, useExisting: DrizzleTelephonyDirectory },
    {
      provide: CREW_PROMPT_SOURCE,
      inject: [TELEPHONY_CONFIG, SpeechSynthesisService],
      useFactory: (
        config: TelephonyConfig,
        synthesis: SpeechSynthesisService,
      ) => new FileCrewPromptStore(config.soundsDir, synthesis),
    },
    {
      provide: AWAITING_HANDOFF,
      inject: [DdsExerciseService],
      useFactory:
        (dds: DdsExerciseService) => (userId: string, exerciseId?: string) =>
          dds.findAwaitingHandoff(userId, exerciseId),
    },
    CrewHandoffService,
    CrewClickToCallService,
    BrowserPhoneProvisioningService,
  ],
})
export class TelephonyModule {}
