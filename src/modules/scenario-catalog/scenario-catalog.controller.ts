import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { ZodSerializerDto } from "nestjs-zod";

import { ApiRoutes } from "@/contracts";
import { JwtAuthGuard } from "@/modules/auth/jwt-auth.guard";

import { type ScenarioList, ScenarioListDto } from "./dto/scenario-summary.dto";
import {
  SCENARIO_CATALOG,
  type ScenarioCatalog,
} from "./ports/scenario-catalog.port";

@Controller(ApiRoutes.Scenarios)
@UseGuards(JwtAuthGuard)
export class ScenarioCatalogController {
  constructor(
    @Inject(SCENARIO_CATALOG)
    private readonly catalog: ScenarioCatalog,
  ) {}

  /** Сценарии, на которых можно тренироваться прямо сейчас. */
  @Get()
  @ZodSerializerDto(ScenarioListDto)
  async list(): Promise<ScenarioList> {
    return { scenarios: [...(await this.catalog.listPublished())] };
  }
}
