import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ZodSerializerDto } from "nestjs-zod";

import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";

import { DdsReferenceService } from "./application/dds-reference.service";
import { DdsTextEvaluationService } from "./application/dds-text-evaluation.service";
import {
  DdsCardReferenceDto,
  RegenerateDdsReferenceDto,
  UpdateDdsReferenceDto,
  type UpdateDdsReference,
} from "./dto/dds-reference.dto";

@Controller("dds-references")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("instructor", "admin")
export class DdsReferenceController {
  constructor(
    private readonly references: DdsReferenceService,
    private readonly evaluations: DdsTextEvaluationService,
  ) {}

  @Get("scenarios/:versionId")
  @ZodSerializerDto(DdsCardReferenceDto)
  get(@Param("versionId", new ParseUUIDPipe()) versionId: string) {
    return this.references.getScenario(versionId);
  }

  @Put("scenarios/:versionId")
  @ZodSerializerDto(DdsCardReferenceDto)
  update(
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
    @Body() body: UpdateDdsReferenceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.references.update(
      { id: request.user.sub, role: request.user.role },
      versionId,
      body as UpdateDdsReference,
    );
  }

  @Post("scenarios/:versionId/regenerate")
  @HttpCode(200)
  @ZodSerializerDto(DdsCardReferenceDto)
  regenerate(
    @Param("versionId", new ParseUUIDPipe()) versionId: string,
    @Body() body: RegenerateDdsReferenceDto,
  ) {
    return this.references.regenerate(versionId, body.comment);
  }

  @Post("exercises/:exerciseId/retry")
  @HttpCode(202)
  async retry(@Param("exerciseId", new ParseUUIDPipe()) exerciseId: string) {
    await this.evaluations.retry(exerciseId);
    return { status: "pending" };
  }
}
