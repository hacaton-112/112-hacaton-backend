import { Module } from "@nestjs/common";

import { AliceAiAdapterModule } from "@/modules/ai-gateway/adapters/alice-ai/alice-ai-adapter.module";
import { AuthModule } from "@/modules/auth/auth.module";

import { ScenarioAuthoringService } from "./application/scenario-authoring.service";
import { AliceAiScenarioDraftAssistant } from "./infrastructure/alice-ai-scenario-draft.assistant";
import { DrizzleScenarioAuthoringRepository } from "./infrastructure/drizzle-scenario-authoring.repository";
import { DrizzleScenarioCatalog } from "./infrastructure/drizzle-scenario.catalog";
import { SCENARIO_AUTHORING_REPOSITORY } from "./ports/scenario-authoring.repository";
import { SCENARIO_CATALOG } from "./ports/scenario-catalog.port";
import { SCENARIO_DRAFT_ASSISTANT } from "./ports/scenario-draft-assistant.port";
import { ScenarioCatalogController } from "./scenario-catalog.controller";

/**
 * Витрина сценариев отдельно от движка.
 *
 * Движок ведёт начатый звонок и ничего не знает о REST; каталог только
 * показывает, с чего звонок можно начать, и потому живёт со своим контроллером
 * и своей защитой.
 */
@Module({
  imports: [AuthModule, AliceAiAdapterModule],
  controllers: [ScenarioCatalogController],
  providers: [
    ScenarioAuthoringService,
    AliceAiScenarioDraftAssistant,
    DrizzleScenarioAuthoringRepository,
    DrizzleScenarioCatalog,
    { provide: SCENARIO_CATALOG, useExisting: DrizzleScenarioCatalog },
    {
      provide: SCENARIO_DRAFT_ASSISTANT,
      useExisting: AliceAiScenarioDraftAssistant,
    },
    {
      provide: SCENARIO_AUTHORING_REPOSITORY,
      useExisting: DrizzleScenarioAuthoringRepository,
    },
  ],
})
export class ScenarioCatalogModule {}
