import { Module } from "@nestjs/common";

import { AuthModule } from "@/modules/auth/auth.module";

import { DrizzleScenarioCatalog } from "./infrastructure/drizzle-scenario.catalog";
import { SCENARIO_CATALOG } from "./ports/scenario-catalog.port";
import { ScenarioCatalogController } from "./scenario-catalog.controller";

/**
 * Витрина сценариев отдельно от движка.
 *
 * Движок ведёт начатый звонок и ничего не знает о REST; каталог только
 * показывает, с чего звонок можно начать, и потому живёт со своим контроллером
 * и своей защитой.
 */
@Module({
  imports: [AuthModule],
  controllers: [ScenarioCatalogController],
  providers: [
    DrizzleScenarioCatalog,
    { provide: SCENARIO_CATALOG, useExisting: DrizzleScenarioCatalog },
  ],
})
export class ScenarioCatalogModule {}
