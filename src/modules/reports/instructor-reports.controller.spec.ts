import type { AuthenticatedRequest } from "@/modules/auth/jwt-auth.guard";

import type { InstructorReportService } from "./application/instructor-report.service";
import { InstructorReportsController } from "./instructor-reports.controller";

const request = {
  user: { sub: "instructor-1", role: "instructor" },
} as AuthenticatedRequest;
const groupId = "00000000-0000-4000-8000-000000000001";

describe(InstructorReportsController.name, () => {
  it("passes the authenticated actor and filters to the report service", async () => {
    const reports = { getReport: jest.fn().mockResolvedValue({ stats: {} }) };
    const controller = new InstructorReportsController(
      reports as unknown as InstructorReportService,
    );
    const query = { scope: "group" as const, groupId };

    await controller.get(request, query);

    expect(reports.getReport).toHaveBeenCalledWith(
      { id: "instructor-1", role: "instructor" },
      query,
    );
  });

  it("returns an attachment with backend filename and content length", async () => {
    const reports = {
      export: jest.fn().mockResolvedValue({
        buffer: Buffer.from("report"),
        contentType: "text/csv; charset=utf-8",
        filename: "instructor-report.csv",
      }),
    };
    const controller = new InstructorReportsController(
      reports as unknown as InstructorReportService,
    );

    const file = await controller.export(request, {
      scope: "group",
      groupId,
      format: "csv",
    });

    expect(file.getHeaders()).toEqual({
      type: "text/csv; charset=utf-8",
      disposition: 'attachment; filename="instructor-report.csv"',
      length: 6,
    });
  });

  it("passes a readiness target with the authenticated actor", async () => {
    const reports = {
      getReadiness: jest.fn().mockResolvedValue({ prediction: {} }),
    };
    const controller = new InstructorReportsController(
      reports as unknown as InstructorReportService,
    );
    const query = { scope: "group" as const, groupId };

    await controller.readiness(request, query);

    expect(reports.getReadiness).toHaveBeenCalledWith(
      { id: "instructor-1", role: "instructor" },
      query,
    );
  });
});
