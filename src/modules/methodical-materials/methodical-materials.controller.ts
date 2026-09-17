import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ZodSerializerDto } from "nestjs-zod";

import { ApiRoutes } from "@/contracts";
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from "@/modules/auth/jwt-auth.guard";

import {
  MethodicalMaterialDto,
  MethodicalMaterialListDto,
  UpdateSectionCompletionDto,
} from "./dto/methodical-materials.dto";
import { MethodicalMaterialsService } from "./methodical-materials.service";

@Controller(ApiRoutes.MethodicalMaterials)
@UseGuards(JwtAuthGuard)
export class MethodicalMaterialsController {
  constructor(private readonly materials: MethodicalMaterialsService) {}

  @Get()
  @ZodSerializerDto(MethodicalMaterialListDto)
  async list(@Req() request: AuthenticatedRequest) {
    return {
      materials: await this.materials.list(request.user.sub, request.user.role),
    };
  }

  @Put(":materialId/sections/:sectionId/completion")
  @ZodSerializerDto(MethodicalMaterialDto)
  setSectionCompletion(
    @Req() request: AuthenticatedRequest,
    @Param("materialId") materialId: string,
    @Param("sectionId") sectionId: string,
    @Body() body: UpdateSectionCompletionDto,
  ) {
    return this.materials.setSectionCompletion(
      request.user.sub,
      request.user.role,
      materialId,
      sectionId,
      body.completed,
    );
  }
}
