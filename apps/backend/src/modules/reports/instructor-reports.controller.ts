import {
  Controller,
  Get,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ZodSerializerDto } from "nestjs-zod";

import { ApiRoutes } from "@/contracts";
import type { AuthenticatedRequest } from "@/modules/auth/jwt-auth.guard";
import { JwtAuthGuard } from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";

import { InstructorReportService } from "./application/instructor-report.service";
import {
  InstructorReportDto,
  InstructorReportExportQueryDto,
  InstructorReportQueryDto,
  InstructorReadinessDto,
  InstructorReadinessQueryDto,
} from "./dto/instructor-report.dto";

const actor = (request: AuthenticatedRequest) => ({
  id: request.user.sub,
  role: request.user.role,
});

@Controller(ApiRoutes.Instructor)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("instructor", "admin")
export class InstructorReportsController {
  constructor(private readonly reports: InstructorReportService) {}

  @Get("reports/export")
  async export(
    @Req() request: AuthenticatedRequest,
    @Query() query: InstructorReportExportQueryDto,
  ): Promise<StreamableFile> {
    const artifact = await this.reports.export(actor(request), query);
    return new StreamableFile(artifact.buffer, {
      type: artifact.contentType,
      disposition: `attachment; filename="${artifact.filename}"`,
      length: artifact.buffer.length,
    });
  }

  @Get("reports")
  @ZodSerializerDto(InstructorReportDto)
  get(
    @Req() request: AuthenticatedRequest,
    @Query() query: InstructorReportQueryDto,
  ) {
    return this.reports.getReport(actor(request), query);
  }

  @Get("readiness")
  @ZodSerializerDto(InstructorReadinessDto)
  readiness(
    @Req() request: AuthenticatedRequest,
    @Query() query: InstructorReadinessQueryDto,
  ) {
    return this.reports.getReadiness(actor(request), query);
  }
}
