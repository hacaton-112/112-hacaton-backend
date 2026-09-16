import { Module } from "@nestjs/common";

import { AuthModule } from "@/modules/auth/auth.module";
import { ScenarioEngineModule } from "@/modules/scenario-engine";

import { TrainingController } from "./training.controller";
import { TrainingService } from "./training.service";

@Module({
  imports: [AuthModule, ScenarioEngineModule],
  controllers: [TrainingController],
  providers: [TrainingService],
  exports: [TrainingService],
})
export class TrainingModule {}
