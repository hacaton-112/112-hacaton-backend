import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { eq } from "drizzle-orm";

import { db, pool } from "@/core/database/drizzle.client";
import { users } from "@/drizzle/schema";
import { AuditLogService } from "@/modules/audit-log/audit-log.service";
import {
  ClassifierService,
  type ClassifierUpload,
} from "@/modules/classifier/classifier.service";
import { ReadExcelFileWorkbookReader } from "@/modules/classifier/infrastructure/read-excel-file-workbook.reader";

const CLASSIFIER_PATH = join(
  process.cwd(),
  "drizzle",
  "seed",
  "classifier",
  "classifier-v046.xlsx",
);

async function main(): Promise<void> {
  try {
    const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@system112.local";
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, adminEmail))
      .limit(1);

    if (!admin) {
      throw new Error(
        `Bootstrap administrator ${adminEmail} is missing; run db:seed:admin first`,
      );
    }

    const [buffer, fileInfo] = await Promise.all([
      readFile(CLASSIFIER_PATH),
      stat(CLASSIFIER_PATH),
    ]);
    const upload: ClassifierUpload = {
      originalname: "classifier-v046.xlsx",
      mimetype:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: fileInfo.size,
      buffer,
    };
    const classifier = new ClassifierService(
      db,
      new ReadExcelFileWorkbookReader(),
      new AuditLogService(db),
    );
    const imported = await classifier.importVersion(upload, admin.id);
    const active = await classifier.activate(imported.id, admin.id);

    console.log(
      `Classifier v${active.version} is active: ${active.recordCount} entries, ${active.warningCount} warnings`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
