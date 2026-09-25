import type { AuditLogService } from "@/modules/audit-log/application/audit-log.service";
import type { AuthenticatedRequest } from "@/modules/auth/jwt-auth.guard";
import type { ReportExporter } from "@/modules/reports/infrastructure/report-exporter";
import { TrainingCertificateController } from "@/modules/reports/training-certificate.controller";
import type { TrainingService } from "@/modules/training/application/training.service";

const request = {
  user: { sub: "instructor-1", role: "instructor" },
} as AuthenticatedRequest;

describe(TrainingCertificateController.name, () => {
  it("фиксирует выдачу сертификата без данных обучающегося", async () => {
    const training = {
      certificateData: jest.fn().mockResolvedValue({ assignmentId: "assignment-1" }),
    };
    const exporter = {
      exportCertificate: jest.fn().mockResolvedValue({
        buffer: Buffer.from("certificate"),
        contentType: "application/pdf",
        filename: "certificate.pdf",
      }),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const controller = new TrainingCertificateController(
      training as unknown as TrainingService,
      exporter as unknown as ReportExporter,
      audit as unknown as AuditLogService,
    );

    await controller.certificate("assignment-1", {}, request);

    expect(audit.log).toHaveBeenCalledWith({
      actorId: "instructor-1",
      action: "training.certificate.issued",
      resource: "training-assignment",
      resourceId: "assignment-1",
    });
  });
});
