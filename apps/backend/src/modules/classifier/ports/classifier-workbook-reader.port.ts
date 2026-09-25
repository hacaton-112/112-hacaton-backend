export type ClassifierWorkbookCell =
  string | number | boolean | Date | DateConstructor | null;

export interface ClassifierWorkbookReader {
  read(
    contents: Buffer,
    sheetName: string,
  ): Promise<readonly (readonly ClassifierWorkbookCell[])[]>;
}

export const CLASSIFIER_WORKBOOK_READER = Symbol("CLASSIFIER_WORKBOOK_READER");
