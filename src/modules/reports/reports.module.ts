import { Module } from "@nestjs/common";

import { AuthModule } from "@/modules/auth/auth.module";
import { DebriefModule } from "@/modules/debrief/debrief.module";
import { TrainingModule } from "@/modules/training/training.module";

import { InstructorReportService } from "./application/instructor-report.service";
import { ReportExporter } from "./infrastructure/report-exporter";
import { InstructorReportsController } from "./instructor-reports.controller";
import { TrainingCertificateController } from "./training-certificate.controller";

@Module({
  imports: [AuthModule, DebriefModule, TrainingModule],
  controllers: [InstructorReportsController, TrainingCertificateController],
  providers: [InstructorReportService, ReportExporter],
})
export class ReportsModule {}
