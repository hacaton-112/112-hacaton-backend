import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";

import {
  CreateMethodicalMaterialDto,
  MethodicalMaterialDto,
  MethodicalMaterialListDto,
  UpdateMethodicalMaterialDto,
  UpdateSectionCompletionDto,
} from "./dto/methodical-materials.dto";
import { MethodicalMaterialsService } from "./application/methodical-materials.service";

@Controller(ApiRoutes.MethodicalMaterials)
@UseGuards(JwtAuthGuard, RolesGuard)
export class MethodicalMaterialsController {
  constructor(private readonly materials: MethodicalMaterialsService) {}

  @Get()
  @ZodSerializerDto(MethodicalMaterialListDto)
  async list(@Req() request: AuthenticatedRequest) {
    return {
      materials: await this.materials.list(request.user.sub, request.user.role),
    };
  }

  @Post()
  @Roles("instructor", "admin")
  @ZodSerializerDto(MethodicalMaterialDto)
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateMethodicalMaterialDto,
  ) {
    return this.materials.create(
      { id: request.user.sub, role: request.user.role },
      body,
    );
  }

  @Put(":materialId")
  @Roles("instructor", "admin")
  @ZodSerializerDto(MethodicalMaterialDto)
  update(
    @Req() request: AuthenticatedRequest,
    @Param("materialId") materialId: string,
    @Body() body: UpdateMethodicalMaterialDto,
  ) {
    return this.materials.update(
      { id: request.user.sub, role: request.user.role },
      materialId,
      body,
    );
  }

  @Put(":materialId/sections/:sectionId/completion")
  @Roles("operator", "instructor", "admin")
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
