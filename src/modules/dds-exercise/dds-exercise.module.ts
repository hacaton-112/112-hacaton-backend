import { Module } from "@nestjs/common";

import { AuthModule } from "@/modules/auth/auth.module";

import { DdsExerciseService } from "./application/dds-exercise.service";
import { DdsExerciseController } from "./dds-exercise.controller";
import { DrizzleDdsExerciseStore } from "./infrastructure/drizzle-dds-exercise.store";
import { DDS_EXERCISE_STORE } from "./ports/dds-exercise.store.port";

@Module({
  imports: [AuthModule],
  controllers: [DdsExerciseController],
  providers: [
    DdsExerciseService,
    DrizzleDdsExerciseStore,
    { provide: DDS_EXERCISE_STORE, useExisting: DrizzleDdsExerciseStore },
  ],
  exports: [DdsExerciseService],
})
export class DdsExerciseModule {}
