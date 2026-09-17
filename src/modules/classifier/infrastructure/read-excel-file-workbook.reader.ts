import { Injectable } from "@nestjs/common";
import { readSheet } from "read-excel-file/node";

import type {
  ClassifierWorkbookCell,
  ClassifierWorkbookReader,
} from "../ports/classifier-workbook-reader.port";

@Injectable()
export class ReadExcelFileWorkbookReader implements ClassifierWorkbookReader {
  async read(
    contents: Buffer,
    sheetName: string,
  ): Promise<readonly (readonly ClassifierWorkbookCell[])[]> {
    return readSheet(contents, sheetName, { trim: true });
  }
}
