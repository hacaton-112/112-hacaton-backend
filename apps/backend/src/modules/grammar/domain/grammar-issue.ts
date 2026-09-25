import type { GrammarIssueContract } from "@/contracts";

/**
 * Что именно не так с текстом.
 *
 * Набор узкий и проверяется правилами, а не моделью: отчёт о занятии должен
 * повторяться на тех же данных, а стажёру нужно объяснение, а не вердикт.
 *
 * Виды и их описания живут в контракте: одну и ту же форму читают разбор,
 * конструктор и настольное приложение. Новый вид, добавленный только здесь,
 * не дошёл бы до клиента и упал бы уже на выдаче отчёта.
 */
export type GrammarIssueKind = GrammarIssueContract["kind"];

/**
 * Ошибка мешает понять запись, замечание — только портит её вид.
 *
 * Разделение нужно отчёту: преподавателю важно, сколько раз стажёр написал
 * непонятное, а не сколько раз поставил два пробела.
 */
export type GrammarSeverity = GrammarIssueContract["severity"];

export interface GrammarIssue {
  readonly kind: GrammarIssueKind;
  readonly severity: GrammarSeverity;
  /** Смещение фрагмента от начала текста в кодовых единицах UTF-16. */
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
  /** Идентификатор поля: путь до него в карточке или в сценарии. */
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
