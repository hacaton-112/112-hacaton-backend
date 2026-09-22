import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { AuthModule } from "@/modules/auth/auth.module";
import {
  parseTelephonyConfig,
  TELEPHONY_ENVIRONMENT_KEYS,
} from "@/modules/telephony/infrastructure/telephony.config";

import { DdsDispatchService } from "./application/dds-dispatch.service";
import {
  DDS_CREW_HANDOFF_REQUIRED,
  DdsExerciseService,
} from "./application/dds-exercise.service";
import { DdsExerciseController } from "./dds-exercise.controller";
import { DdsTrainingController } from "./dds-training.controller";
import { DdsTrainingService } from "./application/dds-training.service";
import { DrizzleDdsExerciseStore } from "./infrastructure/drizzle-dds-exercise.store";
import { DDS_EXERCISE_STORE } from "./ports/dds-exercise.store.port";

@Module({
  imports: [AuthModule, ConfigModule],
  controllers: [DdsExerciseController, DdsTrainingController],
  providers: [
    {
      provide: DDS_CREW_HANDOFF_REQUIRED,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        parseTelephonyConfig(
          Object.fromEntries(
            TELEPHONY_ENVIRONMENT_KEYS.map((key) => [key, config.get(key)]),
          ),
        ).enabled,
    },
    DdsExerciseService,
    DdsTrainingService,
    DdsDispatchService,
    DrizzleDdsExerciseStore,
    { provide: DDS_EXERCISE_STORE, useExisting: DrizzleDdsExerciseStore },
  ],
  exports: [DdsExerciseService, DdsDispatchService],
})
export class DdsExerciseModule {}
