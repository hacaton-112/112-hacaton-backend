import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ZodSerializerDto } from "nestjs-zod";

import { ApiRoutes } from "@/contracts";
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";

import { ScenarioAuthoringService } from "./application/scenario-authoring.service";
import {
  GenerateScenarioDraftRequestDto,
  type GenerateScenarioDraftResponse,
  GenerateScenarioDraftResponseDto,
  type PublishScenarioRequest,
  PublishScenarioRequestDto,
  PublishedScenarioDto,
} from "./dto/scenario-authoring.dto";
import { type ScenarioList, ScenarioListDto } from "./dto/scenario-summary.dto";
import type { PublishedScenario } from "./ports/scenario-authoring.repository";
import {
  SCENARIO_CATALOG,
  type ScenarioCatalog,
} from "./ports/scenario-catalog.port";

@Controller(ApiRoutes.Scenarios)
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScenarioCatalogController {
  constructor(
    @Inject(SCENARIO_CATALOG)
    private readonly catalog: ScenarioCatalog,
    private readonly authoring: ScenarioAuthoringService,
  ) {}

  /** Сценарии, на которых можно тренироваться прямо сейчас. */
  @Get()
  @ZodSerializerDto(ScenarioListDto)
  async list(): Promise<ScenarioList> {
    return { scenarios: [...(await this.catalog.listPublished())] };
  }

  /** AI only prepares an editable draft; this route never writes to the DB. */
  @Post("assistant/draft")
  @Roles("instructor", "admin")
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @ZodSerializerDto(GenerateScenarioDraftResponseDto)
  generateDraft(
    @Body() body: GenerateScenarioDraftRequestDto,
  ): Promise<GenerateScenarioDraftResponse> {
    return this.authoring.generateDraft(body.brief);
  }

  /** Publishing is an explicit instructor action after the complete review. */
  @Post()
  @Roles("instructor", "admin")
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @ZodSerializerDto(PublishedScenarioDto)
  publish(
    @Body() body: PublishScenarioRequestDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PublishedScenario> {
    return this.authoring.publish(
      body as PublishScenarioRequest,
      request.user.sub,
    );
  }
}
