import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ZodSerializerDto } from "nestjs-zod";

import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";
import { ReportExporter } from "@/modules/reports/infrastructure/report-exporter";

import { DdsInsightsService } from "./application/dds-insights.service";
import { DdsReportService } from "./application/dds-report.service";
import {
  DdsLessonReportDto,
  DdsMyResultDto,
  DdsMyResultsDto,
  DdsReportExportQueryDto,
} from "./dto/dds-report.dto";

const actor = (request: AuthenticatedRequest) => ({
  id: request.user.sub,
  role: request.user.role,
});

@Controller("dds")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DdsReportController {
  constructor(
    private readonly reports: DdsReportService,
    private readonly exporter: ReportExporter,
    private readonly insights: DdsInsightsService,
  ) {}

  @Get("lessons/:lessonId/report/export")
  @Roles("instructor", "admin")
  async export(
    @Param("lessonId", new ParseUUIDPipe()) lessonId: string,
    @Query() query: DdsReportExportQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<StreamableFile> {
    const report = await this.reports.lessonReport(actor(request), lessonId);
    const artifact = await this.exporter.exportDdsLesson(report, query.format);
    return new StreamableFile(artifact.buffer, {
      type: artifact.contentType,
      disposition: `attachment; filename="${artifact.filename}"`,
      length: artifact.buffer.length,
    });
  }

  @Get("lessons/:lessonId/report")
  @Roles("instructor", "admin")
  @ZodSerializerDto(DdsLessonReportDto)
  report(
    @Param("lessonId", new ParseUUIDPipe()) lessonId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.reports.lessonReport(actor(request), lessonId);
  }

  @Post("lessons/:lessonId/insights/retry")
  @Roles("instructor", "admin")
  @HttpCode(202)
  async retryInsights(
    @Param("lessonId", new ParseUUIDPipe()) lessonId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.reports.lessonReport(actor(request), lessonId);
    await this.insights.retry(lessonId);
    return { status: "pending" };
  }

  @Get("my/results")
  @Roles("operator")
  @ZodSerializerDto(DdsMyResultsDto)
  myResults(@Req() request: AuthenticatedRequest) {
    return this.reports.myResults(request.user.sub);
  }

  @Get("my/results/:exerciseId")
  @Roles("operator")
  @ZodSerializerDto(DdsMyResultDto)
  myResult(
    @Param("exerciseId", new ParseUUIDPipe()) exerciseId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.reports.myResult(request.user.sub, exerciseId);
  }
}
