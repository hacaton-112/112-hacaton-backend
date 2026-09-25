import {
  ClassifierImportError,
  parseClassifierWorkbook,
} from "@/modules/classifier/domain/classifier-import";

type Cell = string | number | boolean | Date | DateConstructor | null;

const workbook = (): Cell[][] => {
  const rows = Array.from({ length: 7 }, () => Array<Cell>(99).fill(null));

  rows[0]![12] = "Главная служба";
  rows[0]![13] = "Полиция";
  rows[1]![4] = "Номер";
  rows[1]![6] = "112 - Признак.1 (тип происшествия)";
  rows[1]![10] = "Итоговый тип происшествия";
  rows[1]![13] = "Не выбран";
  rows[1]![14] = "Угроза выбрана";

  rows[3]![5] = "Пожары";

  rows[4]![4] = "101";
  rows[4]![6] = "Пожар";
  rows[4]![7] = "Жилое здание";
  rows[4]![10] = "Пожар в жилом здании";
  rows[4]![11] = "ПОЖАР";
  rows[4]![12] = "01";
  rows[4]![13] = "Обычный выезд";
  rows[4]![14] = "Усиленный выезд";

  rows[5]![4] = "102";
  rows[5]![6] = "Не отображается оператору 112";
  rows[5]![10] = "Служебная строка";

  return rows;
};

describe(parseClassifierWorkbook.name, () => {
  it("imports leaf identity, hierarchy, warnings and conditional routing", () => {
    const parsed = parseClassifierWorkbook(workbook());

    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0]).toMatchObject({
      sourceCode: "101",
      sourceRow: 5,
      groupName: "Пожары",
      feature1: "Пожар",
      feature2: "Жилое здание",
      finalType: "Пожар в жилом здании",
      ekpType: "ПОЖАР",
      mainServiceCode: "01",
      operatorVisible: true,
    });
    expect(parsed.entries[0]?.routes.map((route) => route.mode)).toEqual([
      "default",
      "selected",
    ]);
    expect(parsed.entries[1]?.operatorVisible).toBe(false);
    expect(parsed.warnings.map((warning) => warning.code)).toEqual([
      "missing_ekp_type",
      "missing_main_service",
    ]);
  });

  it("rejects a duplicate source code instead of silently merging leaves", () => {
    const rows = workbook();
    rows[5]![4] = "101";

    expect(() => parseClassifierWorkbook(rows)).toThrow(ClassifierImportError);
  });

  it("rejects a workbook with a different contract", () => {
    const rows = workbook();
    rows[1]![10] = "Другое поле";

    expect(() => parseClassifierWorkbook(rows)).toThrow(ClassifierImportError);
  });
});
