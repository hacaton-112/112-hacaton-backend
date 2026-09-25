import { Module } from "@nestjs/common";

import { AuthModule } from "@/modules/auth/auth.module";

import { ClassifierController } from "./classifier.controller";
import { ClassifierService } from "./application/classifier.service";
import { ReadExcelFileWorkbookReader } from "./infrastructure/read-excel-file-workbook.reader";
import { CLASSIFIER_WORKBOOK_READER } from "./ports/classifier-workbook-reader.port";

@Module({
  imports: [AuthModule],
  controllers: [ClassifierController],
  providers: [
    ClassifierService,
    ReadExcelFileWorkbookReader,
    {
      provide: CLASSIFIER_WORKBOOK_READER,
      useExisting: ReadExcelFileWorkbookReader,
    },
  ],
  exports: [ClassifierService],
})
export class ClassifierModule {}
