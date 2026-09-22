import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
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
  DdsReferenceBulkDto,
  DdsReferenceBulkResultDto,
  DdsReferenceListDto,
  DdsReferenceListQueryDto,
  RegenerateDdsReferenceDto,
  UpdateDdsReferenceDto,
  type UpdateDdsReference,
} from "./dto/dds-reference.dto";

@Controller(["dds-references", "dds/references"])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("instructor", "admin")
export class DdsReferenceController {
  constructor(
    private readonly references: DdsReferenceService,
    private readonly evaluations: DdsTextEvaluationService,
  ) {}

  @Get()
  @ZodSerializerDto(DdsReferenceListDto)
  list(@Query() query: DdsReferenceListQueryDto) {
    return this.references.list(query);
  }

  @Post("approve")
  @ZodSerializerDto(DdsReferenceBulkResultDto)
  approveMany(
    @Body() body: DdsReferenceBulkDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.references.approveMany(
      { id: request.user.sub, role: request.user.role },
      body.scenarioVersionIds,
    );
  }

  @Post("regenerate")
  @HttpCode(202)
  @ZodSerializerDto(DdsReferenceBulkResultDto)
  regenerateMany(@Body() body: DdsReferenceBulkDto) {
    return this.references.regenerateMany(body.scenarioVersionIds);
  }

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
