import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";

import type { AuthenticatedRequest } from "@/modules/auth/jwt-auth.guard";
import { JwtAuthGuard } from "@/modules/auth/jwt-auth.guard";
import { Roles } from "@/modules/auth/roles.decorator";
import { RolesGuard } from "@/modules/auth/roles.guard";
import { TrainingService } from "@/modules/training/application/training.service";
import { AuditLogService } from "@/modules/audit-log/application/audit-log.service";

import { TrainingCertificateQueryDto } from "./dto/training-certificate.dto";
import { ReportExporter } from "./infrastructure/report-exporter";

@Controller("training/assignments")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("instructor", "admin")
export class TrainingCertificateController {
  constructor(
    private readonly training: TrainingService,
    private readonly exporter: ReportExporter,
    private readonly audit: AuditLogService,
  ) {}

  @Get(":assignmentId/certificate")
  async certificate(
    @Param("assignmentId", new ParseUUIDPipe()) assignmentId: string,
    @Query() query: TrainingCertificateQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<StreamableFile> {
    const data = await this.training.certificateData(
      { id: request.user.sub, role: request.user.role },
      assignmentId,
      query.studentId,
    );
    const artifact = await this.exporter.exportCertificate(data);
    await this.audit.log({
      actorId: request.user.sub,
      action: "training.certificate.issued",
      resource: "training-assignment",
      resourceId: assignmentId,
    });
    return new StreamableFile(artifact.buffer, {
      type: artifact.contentType,
      disposition: `attachment; filename="${artifact.filename}"`,
      length: artifact.buffer.length,
    });
  }
}
