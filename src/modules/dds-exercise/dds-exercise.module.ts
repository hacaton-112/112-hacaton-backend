import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { AuthModule } from "@/modules/auth/auth.module";
import { TrainingModule } from "@/modules/training/training.module";
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
import { DdsLessonController } from "./dds-lesson.controller";
import { DdsTrainingService } from "./application/dds-training.service";
import { DdsLessonService } from "./application/dds-lesson.service";
import { DrizzleDdsExerciseStore } from "./infrastructure/drizzle-dds-exercise.store";
import { DDS_EXERCISE_STORE } from "./ports/dds-exercise.store.port";
import { TextAiAdapterModule } from "@/modules/ai-gateway/adapters/text-ai-adapter.module";
import { GrammarModule } from "@/modules/grammar";
import { DdsTextEvaluationService } from "./application/dds-text-evaluation.service";
import { DdsReferenceService } from "./application/dds-reference.service";
import { DdsReferenceController } from "./dds-reference.controller";
import { ReportExporter } from "@/modules/reports/infrastructure/report-exporter";
import { DdsReportService } from "./application/dds-report.service";
import { DdsInsightsService } from "./application/dds-insights.service";
import { DdsReportController } from "./dds-report.controller";
import { DdsArchiveService } from "./application/dds-archive.service";
import { DdsArchiveController } from "./dds-archive.controller";

@Module({
  imports: [
    AuthModule,
    ConfigModule,
    TextAiAdapterModule,
    GrammarModule,
    TrainingModule,
  ],
  controllers: [
    DdsExerciseController,
    DdsTrainingController,
    DdsLessonController,
    DdsReferenceController,
    DdsReportController,
    DdsArchiveController,
  ],
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
    DdsLessonService,
    DdsDispatchService,
    DdsTextEvaluationService,
    DdsReferenceService,
    DdsReportService,
    DdsInsightsService,
    DdsArchiveService,
    ReportExporter,
    DrizzleDdsExerciseStore,
    { provide: DDS_EXERCISE_STORE, useExisting: DrizzleDdsExerciseStore },
  ],
  exports: [DdsExerciseService, DdsDispatchService, DdsReferenceService],
})
export class DdsExerciseModule {}
