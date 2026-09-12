import { Module } from "@nestjs/common";

import { AbandonedCallJanitor } from "./application/abandoned-call.janitor";
import { ScenarioEngineService } from "./application/scenario-engine.service";
import { DrizzleScenarioStore } from "./infrastructure/drizzle-scenario.store";
import { SCENARIO_STORE } from "./scenario-engine.tokens";

@Module({
  providers: [
    ScenarioEngineService,
    AbandonedCallJanitor,
    DrizzleScenarioStore,
    { provide: SCENARIO_STORE, useExisting: DrizzleScenarioStore },
  ],
  exports: [ScenarioEngineService],
})
export class ScenarioEngineModule {}
