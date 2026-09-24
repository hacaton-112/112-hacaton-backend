import { Injectable } from "@nestjs/common";
import { Workbook } from "exceljs";
import { join } from "node:path";
import PDFDocument from "pdfkit";

import type {
  InstructorReport,
  InstructorReportAttempt,
  InstructorReportFormat,
  InstructorReportStats,
} from "../dto/instructor-report.dto";
import {
  DDS_PROCESS_ERROR_LABELS,
  DDS_STATUS_LABELS,
} from "@/modules/dds-exercise/domain/dds-report-aggregation";
import type { DdsLessonReport } from "@/modules/dds-exercise/dto/dds-report.dto";
import type { TrainingCertificateData } from "@/modules/training/training.service";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/**
 * Шрифт отчётов: кириллица, латиница и цифры в одном файле.
 *
 * Кириллический субсет Noto Sans, который стоял здесь раньше, рисовал вместо
 * цифр и латиницы пустые квадраты — в субсете этих глифов нет.
 */
export const REPORT_FONT_PATH = join(
  process.cwd(),
  "node_modules",
  "dejavu-fonts-ttf",
  "ttf",
  "DejaVuSans.ttf",
);

export interface ReportArtifact {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

const text = (value: string | number | boolean | null): string => {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  return String(value);
};

const csvCell = (value: string | number | boolean | null): string => {
  const valueText = text(value);
  return `"${valueText.replaceAll('"', '""')}"`;
};

const csvRow = (values: readonly (string | number | boolean | null)[]) =>
  values.map(csvCell).join(";");

const percent = (value: number | null): string =>
  value === null ? "—" : `${value}%`;

const REPORT_PROCESS_ERROR_LABELS: Record<string, string> = {
  ...DDS_PROCESS_ERROR_LABELS,
  voice_late_answer: "Ответ позже норматива",
  voice_critical_question: "Пропущен критический вопрос",
  voice_required_field: "Не заполнено обязательное поле",
  voice_incorrect_field: "Поле карточки заполнено неверно",
};

const statsRows = (stats: InstructorReportStats) =>
  [
    ["Попыток", stats.attempts],
    ["Завершено", stats.completedAttempts],
    ["Оценено", stats.evaluatedAttempts],
    ["Сдано", stats.passedAttempts],
    ["Процент сдачи", percent(stats.passRate)],
    ["Средний балл", stats.averageScore],
    ["Лучший балл", stats.bestScore],
    ["Среднее время ответа, сек.", stats.averageAnswerSeconds],
    ["Средняя длительность, сек.", stats.averageDurationSeconds],
    ["Последняя попытка", stats.lastAttemptAt],
  ] as const;

const reportFilename = (
  report: InstructorReport,
  format: InstructorReportFormat,
) =>
  `instructor-report-${report.scope}-${report.target.id.slice(0, 8)}-${report.generatedAt.slice(0, 10)}.${format}`;

const attemptRow = (attempt: InstructorReportAttempt) =>
  [
    attempt.trainingSessionId,
    attempt.operatorName,
    attempt.groupName,
    attempt.assignmentTitle,
    `${attempt.scenarioCode} — ${attempt.scenarioTitle}`,
    attempt.attemptNumber,
    attempt.status,
    attempt.offeredAt,
    attempt.endedAt,
    attempt.answerSeconds,
    attempt.answerNormSeconds,
    attempt.answeredWithinNorm,
    attempt.durationSeconds,
    attempt.score,
    attempt.passThreshold,
    attempt.passed,
    attempt.analysis.questionsSatisfied,
    attempt.analysis.questionsTotal,
    attempt.analysis.criticalQuestionsMissed,
    attempt.analysis.requiredFieldsMissing,
    attempt.analysis.incorrectFields,
    attempt.analysis.recommendations.join(" | "),
    attempt.grammar.status,
  ] as const;

const ATTEMPT_HEADERS = [
  "ID сессии",
  "Ученик",
  "Группа",
  "Назначение",
  "Сценарий",
  "Попытка",
  "Статус",
  "Начало",
  "Завершение",
  "Ответ, сек.",
  "Норматив ответа, сек.",
  "Норматив соблюдён",
  "Длительность, сек.",
  "Балл",
  "Порог",
  "Сдано",
  "Вопросов закрыто",
  "Вопросов всего",
  "Критических вопросов пропущено",
  "Обязательных полей пропущено",
  "Некорректных полей",
  "Рекомендации",
  "Грамматика",
] as const;

@Injectable()
export class ReportExporter {
  exportCertificate(data: TrainingCertificateData): Promise<ReportArtifact> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({
        size: "A4",
        margins: { top: 58, right: 58, bottom: 58, left: 58 },
        info: { Title: `Сертификат — ${data.assignmentTitle}` },
      });
      const chunks: Buffer[] = [];
      document.on("data", (chunk: Buffer) => chunks.push(chunk));
      document.on("end", () =>
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: "application/pdf",
          filename: `certificate-${data.assignmentId.slice(0, 8)}-${data.operatorId.slice(0, 8)}.pdf`,
        }),
      );
      document.on("error", reject);
      document.registerFont("ReportSans", REPORT_FONT_PATH).font("ReportSans");
      document.fontSize(24).text("СЕРТИФИКАТ", { align: "center" });
      document
        .moveDown(0.4)
        .fontSize(11)
        .text("о завершении учебного назначения", { align: "center" })
        .moveDown(2);
      document.fontSize(12).text(`Обучающийся: ${data.operatorName}`);
      document.text(`Группа: ${data.groupName ?? "индивидуальное назначение"}`);
      document.moveDown();
      document.text(`Назначение: ${data.assignmentTitle}`);
      document.text(
        `Период: ${this.certificateDate(data.startedAt)} — ${this.certificateDate(data.completedAt)}`,
      );
      document.text(`Количество попыток: ${data.attempts}`);
      document.text(`Итоговый балл: ${data.finalScore} из 100`);
      document.text(`Проходной порог: ${data.passThreshold}`);
      document.moveDown(1.5).fontSize(18).text("ЗАЧТЕНО", { align: "center" });
      document.moveDown(3).fontSize(11);
      document.text(`Дата выдачи: ${this.certificateDate(data.issuedAt)}`);
      document.moveDown(2);
      document.text("Место выдачи: ______________________________________");
      document.moveDown(2);
      document.text("Преподаватель: __________________ / ________________");
      document.end();
    });
  }

  async export(
    report: InstructorReport,
    format: InstructorReportFormat,
  ): Promise<ReportArtifact> {
    if (format === "csv") {
      return {
        buffer: Buffer.from(this.csv(report), "utf8"),
        contentType: "text/csv; charset=utf-8",
        filename: reportFilename(report, format),
      };
    }
    if (format === "xlsx") {
      return {
        buffer: await this.xlsx(report),
        contentType: XLSX_MIME,
        filename: reportFilename(report, format),
      };
    }
    return {
      buffer: await this.pdf(report),
      contentType: "application/pdf",
      filename: reportFilename(report, format),
    };
  }

  async exportDdsLesson(
    report: DdsLessonReport,
    format: InstructorReportFormat,
  ): Promise<ReportArtifact> {
    const filename = `dds-lesson-${report.lesson.id.slice(0, 8)}-${report.lesson.finishedAt?.slice(0, 10) ?? "active"}.${format}`;
    if (format === "csv") {
      const headers = [
        "Стажёр",
        "Код сценария",
        "Сценарий",
        "Статус",
        "Реакция, сек.",
        "Норматив реакции, сек.",
        "В нормативе",
        "Завершение, сек.",
        "Автоматический балл",
        "Оценка преподавателя",
        "Итоговый балл",
        "Ошибки",
        "Пропущенные пункты",
      ];
      const rows = report.cards.map((card) =>
        csvRow([
          card.operatorName,
          card.scenarioCode,
          card.scenarioTitle,
          DDS_STATUS_LABELS[card.finalStatus] ?? card.finalStatus,
          card.timing.reactionSeconds,
          card.timing.reactionNormSeconds,
          card.timing.reactionWithinNorm,
          card.timing.completionSeconds,
          card.automaticScore,
          card.instructorReview?.score ?? null,
          card.finalScore,
          card.processErrors
            .map((error) => DDS_PROCESS_ERROR_LABELS[error])
            .join(" | "),
          card.coverage
            .filter(({ status }) => status === "missing")
            .map(({ label }) => label)
            .join(" | "),
        ]),
      );
      return {
        buffer: Buffer.from(
          `\uFEFF${[csvRow(headers), ...rows].join("\r\n")}\r\n`,
          "utf8",
        ),
        contentType: "text/csv; charset=utf-8",
        filename,
      };
    }
    if (format === "xlsx") {
      const workbook = new Workbook();
      const summary = workbook.addWorksheet("Сводка");
      summary.addRows([
        ["Занятие", report.lesson.title],
        ["Карточек", report.summary.cards],
        ["Средний балл", report.summary.averageScore ?? "—"],
        ["Минимальный балл", report.summary.minScore ?? "—"],
        ["Максимальный балл", report.summary.maxScore ?? "—"],
        ["В нормативе, %", report.summary.withinNormPercent ?? "—"],
      ]);
      summary.getColumn(1).width = 28;
      summary.getColumn(2).width = 60;

      const students = workbook.addWorksheet("Стажёры");
      students.addRow(["Стажёр", "Карточек", "Средний", "Минимум", "Максимум"]);
      students.addRows(
        report.students.map((student) => [
          student.operatorName,
          student.cards,
          student.averageScore,
          student.minScore,
          student.maxScore,
        ]),
      );
      this.styleTableHeader(students.getRow(1));

      const cards = workbook.addWorksheet("Карточки");
      cards.addRow([
        "Стажёр",
        "Код",
        "Сценарий",
        "Статус",
        "Реакция, сек.",
        "Норматив, сек.",
        "Итоговый балл",
        "Комментарий преподавателя",
      ]);
      cards.addRows(
        report.cards.map((card) => [
          card.operatorName,
          card.scenarioCode,
          card.scenarioTitle,
          DDS_STATUS_LABELS[card.finalStatus] ?? card.finalStatus,
          card.timing.reactionSeconds,
          card.timing.reactionNormSeconds,
          card.finalScore,
          card.instructorReview?.comment ?? "",
        ]),
      );
      this.styleTableHeader(cards.getRow(1));

      const errors = workbook.addWorksheet("Ошибки");
      errors.addRow(["Стажёр", "Код", "Тип", "Количество"]);
      for (const card of report.cards)
        for (const error of card.processErrors)
          errors.addRow([
            card.operatorName,
            card.scenarioCode,
            DDS_PROCESS_ERROR_LABELS[error],
            1,
          ]);
      this.styleTableHeader(errors.getRow(1));
      for (const sheet of workbook.worksheets)
        sheet.columns.forEach((column) => {
          if (!column.width) column.width = 24;
          column.alignment = { vertical: "top", wrapText: true };
        });
      return {
        buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
        contentType: XLSX_MIME,
        filename,
      };
    }
    return {
      buffer: await this.ddsPdf(report),
      contentType: "application/pdf",
      filename,
    };
  }

  private ddsPdf(report: DdsLessonReport): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({
        size: "A4",
        margins: { top: 40, right: 40, bottom: 40, left: 40 },
        info: { Title: `Отчёт ДДС — ${report.lesson.title}` },
      });
      const chunks: Buffer[] = [];
      document.on("data", (chunk: Buffer) => chunks.push(chunk));
      document.on("end", () => resolve(Buffer.concat(chunks)));
      document.on("error", reject);
      document.registerFont("ReportSans", REPORT_FONT_PATH).font("ReportSans");
      document.fontSize(18).text(`Отчёт по занятию ДДС`);
      document.fontSize(12).text(report.lesson.title).moveDown();
      document
        .fontSize(10)
        .text(
          `Карточек: ${report.summary.cards}. Средний балл: ${text(report.summary.averageScore)}. В нормативе: ${percent(report.summary.withinNormPercent)}.`,
        );
      document.moveDown().fontSize(13).text("Стажёры");
      for (const student of report.students) {
        this.ensurePdfSpace(document, 24);
        document
          .fontSize(9)
          .text(
            `${student.operatorName}: карточек ${student.cards}, средний балл ${text(student.averageScore)}`,
          );
      }
      document.moveDown().fontSize(13).text("Карточки и ошибки");
      for (const card of report.cards) {
        this.ensurePdfSpace(document, 55);
        document
          .fontSize(9)
          .text(
            `${card.operatorName} · ${card.scenarioCode} — ${card.scenarioTitle}`,
          )
          .text(
            `Статус: ${DDS_STATUS_LABELS[card.finalStatus] ?? card.finalStatus}; реакция: ${text(card.timing.reactionSeconds)} сек.; балл: ${text(card.finalScore)}`,
          )
          .text(
            `Ошибки: ${card.processErrors.map((error) => DDS_PROCESS_ERROR_LABELS[error]).join(", ") || "не выявлены"}`,
          );
      }
      if (report.insights?.status === "done") {
        document.moveDown().fontSize(13).text("Выводы по группе");
        document
          .fontSize(9)
          .text(`Сильные стороны: ${report.insights.strengths.join("; ")}`)
          .text(`Слабые стороны: ${report.insights.weaknesses.join("; ")}`)
          .text(`Рекомендации: ${report.insights.recommendations.join("; ")}`);
      }
      document.end();
    });
  }

  private certificateDate(value: string): string {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Europe/Moscow",
    }).format(new Date(value));
  }

  private csv(report: InstructorReport): string {
    const rows: string[] = [
      csvRow(["Отчёт преподавателя"]),
      csvRow(["Сформирован", report.generatedAt]),
      csvRow(["Объект", report.target.name]),
      csvRow(["Тип", report.scope]),
      csvRow(["Период с", report.period.from]),
      csvRow(["Период по", report.period.to]),
      csvRow(["Грамматика", report.grammar.message]),
      "",
      csvRow(["Показатель", "Значение"]),
      ...statsRows(report.stats).map((row) => csvRow(row)),
      "",
      csvRow(["ДДС"]),
      csvRow(["Карточек", report.dds.cards]),
      csvRow(["Средний автоматический балл", report.dds.averageScore]),
      csvRow(["Итоговый балл", report.dds.finalScore]),
      csvRow(["В нормативе", percent(report.dds.withinNormPercent)]),
      csvRow(["Полнота текста", percent(report.dds.averageCoveragePercent)]),
      ...report.dds.topErrors.map((error) =>
        csvRow([DDS_PROCESS_ERROR_LABELS[error.type], error.count]),
      ),
      "",
      csvRow(ATTEMPT_HEADERS),
      ...report.attempts.map((attempt) => csvRow(attemptRow(attempt))),
    ];
    // BOM помогает Excel корректно открыть кириллицу в UTF-8 CSV.
    return `\uFEFF${rows.join("\r\n")}\r\n`;
  }

  private async xlsx(report: InstructorReport): Promise<Buffer> {
    const workbook = new Workbook();
    workbook.creator = "System 112 Training";
    workbook.created = new Date(report.generatedAt);

    const summary = workbook.addWorksheet("Сводка");
    summary.addRows([
      ["Отчёт преподавателя"],
      ["Сформирован", report.generatedAt],
      ["Объект", report.target.name],
      ["Тип", report.scope],
      ["Период с", report.period.from ?? "—"],
      ["Период по", report.period.to ?? "—"],
      ["Грамматика", report.grammar.message],
      [],
      ["Показатель", "Значение"],
      ...statsRows(report.stats),
    ]);
    summary.getColumn(1).width = 34;
    summary.getColumn(2).width = 58;
    summary.getRow(1).font = { bold: true, size: 16 };
    summary.getRow(9).font = { bold: true };

    const students = workbook.addWorksheet("Ученики", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    students.columns = [
      { header: "Ученик", key: "name", width: 30 },
      { header: "Email", key: "email", width: 32 },
      { header: "Службы", key: "services", width: 24 },
      { header: "Попыток", key: "attempts", width: 12 },
      { header: "Завершено", key: "completed", width: 14 },
      { header: "Оценено", key: "evaluated", width: 12 },
      { header: "Сдано", key: "passed", width: 10 },
      { header: "Сдача, %", key: "passRate", width: 12 },
      { header: "Средний балл", key: "averageScore", width: 16 },
      { header: "Лучший балл", key: "bestScore", width: 14 },
    ];
    students.addRows(
      report.students.map((student) => ({
        name: student.operatorName,
        email: student.email ?? "—",
        services: student.serviceTags.join(", ") || "—",
        attempts: student.stats.attempts,
        completed: student.stats.completedAttempts,
        evaluated: student.stats.evaluatedAttempts,
        passed: student.stats.passedAttempts,
        passRate: student.stats.passRate,
        averageScore: student.stats.averageScore,
        bestScore: student.stats.bestScore,
      })),
    );
    this.styleTableHeader(students.getRow(1));

    const attempts = workbook.addWorksheet("Попытки", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    attempts.addRow([...ATTEMPT_HEADERS]);
    attempts.addRows(
      report.attempts.map((attempt) => [...attemptRow(attempt)]),
    );
    this.styleTableHeader(attempts.getRow(1));
    attempts.columns.forEach((column, index) => {
      column.width = index === 21 ? 48 : index < 5 ? 24 : 16;
      column.alignment = { vertical: "top", wrapText: true };
    });
    attempts.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: ATTEMPT_HEADERS.length },
    };

    const dds = workbook.addWorksheet("ДДС");
    dds.addRows([
      ["Показатель", "Значение"],
      ["Карточек", report.dds.cards],
      ["Средний автоматический балл", report.dds.averageScore ?? "—"],
      ["Итоговый балл", report.dds.finalScore ?? "—"],
      ["В нормативе, %", report.dds.withinNormPercent ?? "—"],
      ["Полнота текста, %", report.dds.averageCoveragePercent ?? "—"],
      [],
      ["Частая ошибка", "Количество"],
      ...report.dds.topErrors.map(({ type, count }) => [
        DDS_PROCESS_ERROR_LABELS[type],
        count,
      ]),
      [],
      ["Занятие", "Дата", "Средний балл"],
      ...report.dds.scoreDynamics.map(({ title, occurredAt, score }) => [
        title,
        occurredAt,
        score ?? "—",
      ]),
    ]);
    dds.getColumn(1).width = 42;
    dds.getColumn(2).width = 24;
    dds.getColumn(3).width = 18;
    this.styleTableHeader(dds.getRow(1));

    if (report.analytics) {
      const analytics = workbook.addWorksheet("Аналитика");
      analytics.addRow([
        "Поля карточки",
        "Верно",
        "Пропущено или неверно",
        "Исправлено после разбора",
        "Точность, %",
      ]);
      analytics.addRows(
        report.analytics.cardFields.map((field) => [
          field.label,
          field.correct,
          field.missed,
          field.correctedAfterHint,
          field.correctRate,
        ]),
      );
      analytics.addRow([]);
      analytics.addRow([
        "Пункт эталона ДДС",
        "Код",
        "Пропущено",
        "Всего",
        "Доля пропусков, %",
      ]);
      analytics.addRows(
        report.analytics.ddsReferenceItems.map((item) => [
          item.label,
          item.id,
          item.missing,
          item.total,
          item.missRate,
        ]),
      );
      analytics.addRow([]);
      analytics.addRow(["Процессная ошибка", "Количество", "Обучающиеся"]);
      analytics.addRows(
        report.analytics.processErrors.map((error) => [
          REPORT_PROCESS_ERROR_LABELS[error.type] ?? error.type,
          error.total,
          error.students
            .map((student) => `${student.operatorName}: ${student.count}`)
            .join("; "),
        ]),
      );
      analytics.addRow([]);
      analytics.addRow([
        "Динамика",
        "Период или занятие",
        "Дата",
        "Средний балл",
        "Попыток",
      ]);
      analytics.addRows([
        ...report.analytics.dynamics.voice.map((point) => [
          "Голос",
          point.label,
          point.occurredAt,
          point.averageScore,
          point.attempts,
        ]),
        ...report.analytics.dynamics.dds.map((point) => [
          "ДДС",
          point.label,
          point.occurredAt,
          point.averageScore,
          point.attempts,
        ]),
      ]);
      analytics.addRow([]);
      analytics.addRow([
        "Тепловая карта",
        ...report.analytics.heatmap.fields.map(({ label }) => label),
      ]);
      analytics.addRows(
        report.analytics.heatmap.rows.map((row) => [
          row.operatorName,
          ...row.values.map((value) => value ?? "—"),
        ]),
      );
      analytics.columns.forEach((column, index) => {
        column.width = index === 0 ? 34 : index === 2 ? 48 : 22;
        column.alignment = { vertical: "top", wrapText: true };
      });
      this.styleTableHeader(analytics.getRow(1));
    }

    const output = await workbook.xlsx.writeBuffer();
    return Buffer.from(output);
  }

  private styleTableHeader(row: import("exceljs").Row): void {
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2457A7" },
    };
    row.alignment = { vertical: "middle", wrapText: true };
  }

  private pdf(report: InstructorReport): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({
        size: "A4",
        margins: { top: 40, right: 40, bottom: 40, left: 40 },
        info: { Title: `Отчёт преподавателя — ${report.target.name}` },
      });
      const chunks: Buffer[] = [];
      document.on("data", (chunk: Buffer) => chunks.push(chunk));
      document.on("end", () => resolve(Buffer.concat(chunks)));
      document.on("error", reject);
      document.registerFont("ReportSans", REPORT_FONT_PATH).font("ReportSans");

      document.fontSize(18).text("Отчёт преподавателя");
      document.moveDown(0.4).fontSize(10);
      document.text(`Объект: ${report.target.name}`);
      document.text(`Сформирован: ${report.generatedAt}`);
      document.text(
        `Период: ${report.period.from ?? "без ограничения"} — ${report.period.to ?? "без ограничения"}`,
      );
      document.fillColor("#7A3E00").text(report.grammar.message);
      document.fillColor("#111111").moveDown(0.5);

      document.fontSize(13).text("Сводка");
      document.fontSize(9);
      for (const [label, value] of statsRows(report.stats)) {
        document.text(`${label}: ${text(value)}`);
      }

      document.moveDown().fontSize(13).text("ДДС");
      document
        .fontSize(9)
        .text(`Карточек: ${report.dds.cards}`)
        .text(`Средний автоматический балл: ${text(report.dds.averageScore)}`)
        .text(`Итоговый балл: ${text(report.dds.finalScore)}`)
        .text(`В нормативе: ${percent(report.dds.withinNormPercent)}`)
        .text(`Полнота текста: ${percent(report.dds.averageCoveragePercent)}`);
      if (report.dds.cards === 0)
        document.text("За выбранный период карточек ДДС нет.");
      for (const error of report.dds.topErrors)
        document.text(
          `${DDS_PROCESS_ERROR_LABELS[error.type]}: ${error.count}`,
        );

      if (report.analytics) {
        document.moveDown().fontSize(13).text("Аналитика группы");
        document.fontSize(9).text("Слабые поля карточки вызова:");
        for (const field of report.analytics.cardFields.slice(0, 8)) {
          this.ensurePdfSpace(document, 20);
          document.text(
            `${field.label}: точность ${field.correctRate}%, пропущено ${field.missed}, исправлено после разбора ${field.correctedAfterHint}`,
          );
        }
        document.moveDown(0.4).text("Пропуски в эталоне ДДС:");
        for (const item of report.analytics.ddsReferenceItems.slice(0, 8)) {
          this.ensurePdfSpace(document, 20);
          document.text(
            `${item.label} (${item.id}): ${item.missRate}% (${item.missing} из ${item.total})`,
          );
        }
        document.moveDown(0.4).text("Процессные ошибки:");
        for (const error of report.analytics.processErrors) {
          this.ensurePdfSpace(document, 20);
          document.text(
            `${REPORT_PROCESS_ERROR_LABELS[error.type] ?? error.type}: ${error.total}; ${error.students.map((student) => `${student.operatorName} — ${student.count}`).join(", ")}`,
          );
        }
        document.moveDown(0.4).text("Динамика среднего балла:");
        for (const [track, points] of [
          ["Голос", report.analytics.dynamics.voice],
          ["ДДС", report.analytics.dynamics.dds],
        ] as const) {
          for (const point of points) {
            this.ensurePdfSpace(document, 20);
            document.text(
              `${track}, ${point.label}: ${point.averageScore} (${point.attempts} попыток)`,
            );
          }
        }
        document.moveDown(0.4).text("Тепловая карта полей:");
        for (const row of report.analytics.heatmap.rows) {
          this.ensurePdfSpace(document, 28);
          document.text(
            `${row.operatorName}: ${report.analytics.heatmap.fields.map((field, index) => `${field.label} — ${row.values[index] ?? "—"}%`).join("; ")}`,
          );
        }
      }

      if (report.students.length > 0) {
        document.moveDown().fontSize(13).text("Ученики");
        document.fontSize(9);
        for (const student of report.students) {
          this.ensurePdfSpace(document, 28);
          document.text(
            `${student.operatorName}: попыток ${student.stats.attempts}, средний балл ${text(student.stats.averageScore)}, сдача ${percent(student.stats.passRate)}`,
          );
        }
      }

      document.moveDown().fontSize(13).text("Попытки");
      if (report.attempts.length === 0) {
        document.fontSize(9).text("За выбранный период попыток нет.");
      }
      for (const attempt of report.attempts) {
        this.ensurePdfSpace(document, 92);
        document
          .moveDown(0.5)
          .fontSize(10)
          .text(
            `${attempt.operatorName} · ${attempt.scenarioCode} · попытка ${attempt.attemptNumber}`,
          );
        document.fontSize(8.5);
        document.text(
          `Назначение: ${attempt.assignmentTitle}; статус: ${attempt.status}; балл: ${text(attempt.score)}/${attempt.passThreshold}`,
        );
        document.text(
          `Ответ: ${text(attempt.answerSeconds)} сек. при нормативе ${attempt.answerNormSeconds}; длительность: ${text(attempt.durationSeconds)} сек.`,
        );
        document.text(
          `Ошибки: критические вопросы ${text(attempt.analysis.criticalQuestionsMissed)}, обязательные поля ${text(attempt.analysis.requiredFieldsMissing)}, некорректные поля ${text(attempt.analysis.incorrectFields)}.`,
        );
        if (attempt.analysis.recommendations.length > 0) {
          document.text(
            `Рекомендации: ${attempt.analysis.recommendations.join("; ")}`,
          );
        }
      }

      document.end();
    });
  }

  private ensurePdfSpace(document: PDFKit.PDFDocument, height: number): void {
    if (
      document.y + height >
      document.page.height - document.page.margins.bottom
    ) {
      document.addPage();
    }
  }
}
