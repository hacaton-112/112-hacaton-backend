import { Module } from "@nestjs/common";

import { AuthModule } from "@/modules/auth/auth.module";
import { CallRecordingModule } from "@/modules/call-recording";
import { IncidentCardModule } from "@/modules/incident-card";
import { TrainingModule } from "@/modules/training/training.module";

import { DebriefService } from "./application/debrief.service";
import { DebriefController } from "./debrief.controller";
import { InstructorCallsController } from "./instructor-calls.controller";
import { DrizzleDebriefStore } from "./infrastructure/drizzle-debrief.store";
import { DEBRIEF_STORE } from "./ports/debrief.store.port";

@Module({
  imports: [
    AuthModule,
    CallRecordingModule,
    IncidentCardModule,
    TrainingModule,
  ],
  controllers: [DebriefController, InstructorCallsController],
  providers: [
    DebriefService,
    DrizzleDebriefStore,
    { provide: DEBRIEF_STORE, useExisting: DrizzleDebriefStore },
  ],
})
export class DebriefModule {}
