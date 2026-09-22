import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ZodSerializerDto } from "nestjs-zod";
import { ApiRoutes } from "@/contracts";
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";
import { ScenarioAudioService } from "./scenario-audio.service";
import { ScenarioAudioStatusDto } from "./scenario-audio.dto";

@Controller(
  `${ApiRoutes.Scenarios}/versions/:scenarioVersionId/audio-preparation`,
)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("instructor", "admin")
export class ScenarioAudioController {
  constructor(private readonly audio: ScenarioAudioService) {}

  @Get()
  @ZodSerializerDto(ScenarioAudioStatusDto)
  status(@Param("scenarioVersionId", new ParseUUIDPipe()) versionId: string) {
    return this.audio.status(versionId);
  }

  @Post()
  @ZodSerializerDto(ScenarioAudioStatusDto)
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  prepare(
    @Param("scenarioVersionId", new ParseUUIDPipe()) versionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.audio.enqueue(versionId, request.user.sub);
  }
}
