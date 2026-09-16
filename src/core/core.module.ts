import { Logger, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ZodSerializerInterceptor, ZodValidationPipe } from "nestjs-zod";

import { GlobalExceptionFilter } from "@/common/filters/global-exception.filter";
import { LoggingInterceptor } from "@/common/interceptors/logging.interceptor";
import { AsrModule } from "@/modules/asr/asr.module";
import { AuditLogModule } from "@/modules/audit-log/audit-log.module";
import { AuthModule } from "@/modules/auth/auth.module";
import { ClassifierModule } from "@/modules/classifier";
import { DebriefModule } from "@/modules/debrief/debrief.module";
import { DdsExerciseModule } from "@/modules/dds-exercise";
import { HealthModule } from "@/modules/health/health.module";
import { GeocodingModule } from "@/modules/geocoding/geocoding.module";
import { IncidentCardModule } from "@/modules/incident-card";
import { MetricsModule } from "@/modules/metrics";
import { ScenarioCatalogModule } from "@/modules/scenario-catalog/scenario-catalog.module";
import { TrainingModule } from "@/modules/training/training.module";
import { UsersModule } from "@/modules/users/users.module";
import { VoicePipelineModule } from "@/modules/voice-pipeline";

import { IS_DEV_ENV } from "./config/app.config";
import "./config/env.config";
import { throttlerConfig } from "./config/throttler.config";
import { DatabaseModule } from "./database/database.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      ignoreEnvFile: !IS_DEV_ENV,
      isGlobal: true,
    }),
    ThrottlerModule.forRoot(throttlerConfig),
    DatabaseModule,
    MetricsModule,
    AuditLogModule,
    HealthModule,
    GeocodingModule,
    AuthModule,
    ClassifierModule,
    AsrModule,
    DebriefModule,
    DdsExerciseModule,
    IncidentCardModule,
    ScenarioCatalogModule,
    TrainingModule,
    UsersModule,
    VoicePipelineModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ZodSerializerInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useFactory: () => new LoggingInterceptor(new Logger("HTTP")),
    },
  ],
})
export class CoreModule {}
