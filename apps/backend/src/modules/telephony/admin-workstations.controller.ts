import { Body, Controller, Get, Header, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { ZodSerializerDto } from "nestjs-zod";

import { JwtAuthGuard, type AuthenticatedRequest } from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";

import { WorkstationConfigurationService } from "./application/workstation-configuration.service";
import {
  WorkstationExportQueryDto,
  WorkstationImportReportDto,
  WorkstationImportRequestDto,
} from "./dto/telephony.dto";

@Controller("admin/workstations")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class AdminWorkstationsController {
  constructor(private readonly configurations: WorkstationConfigurationService) {}

  @Get("export")
  @Header("Cache-Control", "no-store")
  async export(
    @Query() query: WorkstationExportQueryDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    reply.header(
      "Content-Type",
      query.format === "xml" ? "application/xml; charset=utf-8" : "text/csv; charset=utf-8",
    );
    reply.header(
      "Content-Disposition",
      `attachment; filename="workstations.${query.format}"`,
    );
    return this.configurations.export(query.format);
  }

  @Post("import")
  @ZodSerializerDto(WorkstationImportReportDto)
  import(
    @Body() body: WorkstationImportRequestDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.configurations.import(
      body.content,
      body.format,
      body.dryRun,
      request.user.sub,
    );
  }
}
