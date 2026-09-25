import { Module } from "@nestjs/common";

import { TextAiAdapterModule } from "@/modules/ai-gateway/adapters/text-ai-adapter.module";
import { GrammarModule } from "@/modules/grammar";
import { AuthModule } from "@/modules/auth/auth.module";
import { TrainingModule } from "@/modules/training/training.module";

import { ScenarioAuthoringService } from "./application/scenario-authoring.service";
import { ScenarioGenerationService } from "./application/scenario-generation.service";
import { ScenarioPackageService } from "./application/scenario-package.service";
import { StructuredOutputScenarioDraftAssistant } from "./infrastructure/structured-output-scenario-draft.assistant";
import { DrizzleScenarioAuthoringRepository } from "./infrastructure/drizzle-scenario-authoring.repository";
import { DrizzleScenarioCatalog } from "./infrastructure/drizzle-scenario.catalog";
import { DrizzleScenarioGenerationRepository } from "./infrastructure/drizzle-scenario-generation.repository";
import { SCENARIO_AUTHORING_REPOSITORY } from "./ports/scenario-authoring.repository";
import { SCENARIO_CATALOG } from "./ports/scenario-catalog.port";
import { SCENARIO_DRAFT_ASSISTANT } from "./ports/scenario-draft-assistant.port";
import { SCENARIO_GENERATION_REPOSITORY } from "./ports/scenario-generation.repository";
import { ScenarioCatalogController } from "./scenario-catalog.controller";

/**
 * Витрина сценариев отдельно от движка.
 *
 * Движок ведёт начатый звонок и ничего не знает о REST; каталог только
 * показывает, с чего звонок можно начать, и потому живёт со своим контроллером
 * и своей защитой.
 */
@Module({
  imports: [AuthModule, TextAiAdapterModule, GrammarModule, TrainingModule],
  controllers: [ScenarioCatalogController],
  providers: [
    ScenarioAuthoringService,
    ScenarioGenerationService,
    ScenarioPackageService,
    DrizzleScenarioGenerationRepository,
    {
      provide: SCENARIO_GENERATION_REPOSITORY,
      useExisting: DrizzleScenarioGenerationRepository,
    },
    StructuredOutputScenarioDraftAssistant,
    DrizzleScenarioAuthoringRepository,
    DrizzleScenarioCatalog,
    { provide: SCENARIO_CATALOG, useExisting: DrizzleScenarioCatalog },
    {
      provide: SCENARIO_DRAFT_ASSISTANT,
      useExisting: StructuredOutputScenarioDraftAssistant,
    },
    {
      provide: SCENARIO_AUTHORING_REPOSITORY,
      useExisting: DrizzleScenarioAuthoringRepository,
    },
  ],
})
export class ScenarioCatalogModule {}
