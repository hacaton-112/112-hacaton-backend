import { openSync } from "fontkit";
import { Workbook } from "exceljs";

import type { DdsLessonReport } from "@/modules/dds-exercise/dto/dds-report.dto";

import { ReportExporter, REPORT_FONT_PATH } from "@/modules/reports/infrastructure/report-exporter";

const id = (suffix: string) =>
  `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const report: DdsLessonReport = {
  lesson: {
    id: id("1"),
    title: "Практическое занятие ДДС",
    status: "finished",
    startedAt: "2026-09-22T10:00:00.000Z",
    finishedAt: "2026-09-22T11:00:00.000Z",
    acknowledgementNormSeconds: 30,
    passThreshold: 75,
  },
  summary: {
    cards: 1,
    averageScore: 88,
    minScore: 88,
    maxScore: 88,
    withinNormPercent: 100,
    topErrors: [],
    outcomes: [{ status: "completed", count: 1 }],
  },
  students: [
    {
      operatorId: id("2"),
      operatorName: "Иван Стажёр",
      cards: 1,
      averageScore: 88,
      minScore: 88,
      maxScore: 88,
    },
  ],
  cards: [
    {
      exerciseId: id("3"),
      operatorId: id("2"),
      operatorName: "Иван Стажёр",
      scenarioVersionId: id("4"),
      scenarioCode: "T01-1",
      scenarioTitle: "Учебное происшествие",
      finalStatus: "completed",
      expectedOutcome: "accept",
      outcomeMatched: true,
      timeline: [],
      timing: {
        reactionSeconds: 20,
        reactionNormSeconds: 30,
        reactionWithinNorm: true,
        completionSeconds: 300,
        completionNormSeconds: 600,
        completionWithinNorm: true,
      },
      processErrors: [],
      coverage: [],
      contradictions: [],
      grammar: null,
      automaticScore: 88,
      instructorReview: null,
      finalScore: 88,
    },
  ],
  insights: null,
};

describe("DDS report export", () => {
  const exporter = new ReportExporter();

  it("writes one UTF-8 BOM CSV row per card", async () => {
    const artifact = await exporter.exportDdsLesson(report, "csv");
    expect(artifact.buffer.subarray(0, 3)).toEqual(
      Buffer.from([0xef, 0xbb, 0xbf]),
    );
    expect(artifact.buffer.toString("utf8")).toContain("Иван Стажёр");
  });

  it("writes the four required XLSX sheets", async () => {
    const artifact = await exporter.exportDdsLesson(report, "xlsx");
    const workbook = new Workbook();
    // В типах ExcelJS остался старый Buffer без параметра ArrayBuffer, хотя рантайм принимает тот же буфер.
    await workbook.xlsx.load(artifact.buffer as never);
    expect(workbook.worksheets.map(({ name }) => name)).toEqual([
      "Сводка",
      "Стажёры",
      "Карточки",
      "Ошибки",
    ]);
  });

  it("writes a PDF with a Cyrillic font", async () => {
    const artifact = await exporter.exportDdsLesson(report, "pdf");
    expect(artifact.buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(artifact.buffer.length).toBeGreaterThan(1_000);
  });

  it("uses a font that has both Cyrillic letters and digits", () => {
    // Кириллический субсет рисовал вместо баллов и секунд пустые квадраты.
    const font = openSync(REPORT_FONT_PATH);
    const missing = [..."Принято 1234567890 %"].filter(
      (symbol) =>
        symbol !== " " &&
        font.glyphForCodePoint(symbol.codePointAt(0)!).id === 0,
    );
    expect(missing).toEqual([]);
  });
});
