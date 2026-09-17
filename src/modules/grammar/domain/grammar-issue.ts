/**
 * Что именно не так с текстом.
 *
 * Набор узкий и проверяется правилами, а не моделью: отчёт о занятии должен
 * повторяться на тех же данных, а стажёру нужно объяснение, а не вердикт.
 */
export const GRAMMAR_ISSUE_KINDS = [
  /** Латиница внутри русского слова: «пoжар» с латинской «o». */
  "mixed-alphabet",
  /** Слово повторено подряд: «на на улице». */
  "repeated-word",
  "double-space",
  "space-before-punctuation",
  "missing-space-after-punctuation",
  /** Предложение начинается со строчной буквы. */
  "lowercase-sentence-start",
  /** Текст набран заглавными. */
  "caps-lock",
  /** Цифра слиплась со словом: «5этаж». */
  "digit-letter-glue",
  "unbalanced-bracket",
  "unbalanced-quote",
  /** Подряд несколько знаков: «!!!». */
  "repeated-punctuation",
  /** Нашла модель при углублённой проверке. */
  "model-review",
] as const;

export type GrammarIssueKind = (typeof GRAMMAR_ISSUE_KINDS)[number];

/**
 * Ошибка мешает понять запись, замечание — только портит её вид.
 *
 * Разделение нужно отчёту: преподавателю важно, сколько раз стажёр написал
 * непонятное, а не сколько раз поставил два пробела.
 */
export type GrammarSeverity = "error" | "style";

export interface GrammarIssue {
  readonly kind: GrammarIssueKind;
  readonly severity: GrammarSeverity;
  /** Смещение фрагмента в символах от начала текста. */
  readonly offset: number;
  readonly length: number;
  readonly fragment: string;
  /** Объяснение на русском: его читает стажёр, а не разработчик. */
  readonly message: string;
  /** Исправленный фрагмент, когда исправление однозначно. */
  readonly suggestion: string | null;
}

/**
 * Насколько строго читать текст.
 *
 * `terse` — поля вроде улицы и фамилии: в них нет предложений, и требовать
 * заглавную букву или точку в конце бессмысленно. `prose` — примечания
 * диспетчера и комментарии, которые читает другая служба.
 */
export type GrammarTextStyle = "terse" | "prose";

export interface GrammarText {
  /** Идентификатор поля: по нему интерфейс подсвечивает нужное место. */
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly style: GrammarTextStyle;
}

export interface GrammarFieldReport {
  readonly id: string;
  readonly label: string;
  readonly issues: readonly GrammarIssue[];
  readonly errorCount: number;
  readonly styleCount: number;
}

export interface GrammarReport {
  readonly fields: readonly GrammarFieldReport[];
  readonly errorCount: number;
  readonly styleCount: number;
  /** Участвовала ли модель: правила работают всегда, модель — по запросу. */
  readonly reviewedByModel: boolean;
}
