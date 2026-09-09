import { Module } from "@nestjs/common";

import { ScenarioEngineService } from "./application/scenario-engine.service";
import { DrizzleScenarioStore } from "./infrastructure/drizzle-scenario.store";
import { SCENARIO_STORE } from "./scenario-engine.tokens";

@Module({
  providers: [
    ScenarioEngineService,
    DrizzleScenarioStore,
    { provide: SCENARIO_STORE, useExisting: DrizzleScenarioStore },
  ],
  exports: [ScenarioEngineService],
})
export class ScenarioEngineModule {}
