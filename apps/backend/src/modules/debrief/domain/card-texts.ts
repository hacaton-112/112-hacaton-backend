import type { GrammarText } from "@/modules/grammar";
import type { IncidentCard } from "@/modules/incident-card/dto/incident-card.dto";

/**
 * Поля карточки, которые пишет человек.
 *
 * Списки, флажки, числа и координаты сюда не попадают: в них нечего читать, а
 * пустое поле — вопрос к полноте карточки, а не к грамотности.
 *
 * `terse` — короткие значения вроде фамилии и района: требовать в них
 * заглавную букву и точку бессмысленно. `prose` — то, что потом читает другая
 * служба: адрес, описание и примечания.
 */
const CARD_TEXTS: readonly {
  key: keyof IncidentCard;
  label: string;
  style: GrammarText["style"];
}[] = [
  { key: "callerLastName", label: "Фамилия заявителя", style: "terse" },
  { key: "callerFirstName", label: "Имя заявителя", style: "terse" },
  { key: "callerMiddleName", label: "Отчество заявителя", style: "terse" },
  { key: "callerLanguage", label: "Язык заявителя", style: "terse" },
  { key: "addressText", label: "Адрес", style: "prose" },
  { key: "district", label: "Район", style: "terse" },
  { key: "objectType", label: "Тип объекта", style: "terse" },
  { key: "placeNotes", label: "Примечания к месту", style: "prose" },
  { key: "incidentType", label: "Тип происшествия", style: "terse" },
  { key: "description", label: "Описание происшествия", style: "prose" },
];

const VICTIM_TEXTS: readonly {
  key: "lastName" | "firstName" | "middleName" | "reason" | "notes";
  label: string;
  style: GrammarText["style"];
}[] = [
  { key: "lastName", label: "фамилия", style: "terse" },
  { key: "firstName", label: "имя", style: "terse" },
  { key: "middleName", label: "отчество", style: "terse" },
  { key: "reason", label: "повод вызова", style: "prose" },
  { key: "notes", label: "примечания", style: "prose" },
];

/**
 * Собирает тексты карточки для проверки грамотности.
 *
 * Идентификатор совпадает с путём поля в карточке: разбор показывает его
 * подписью, а интерфейс сможет открыть нужное место, когда до навигации по
 * замечаниям дойдут руки.
 */
export const incidentCardTexts = (
  card: IncidentCard | null,
): readonly GrammarText[] => {
  if (card === null) {
    return [];
  }

  const texts: GrammarText[] = [];

  for (const { key, label, style } of CARD_TEXTS) {
    const value = card[key];

    if (typeof value === "string" && value.trim().length > 0) {
      texts.push({ id: key, label, value, style });
    }
  }

  card.victims.forEach((victim, index) => {
    for (const { key, label, style } of VICTIM_TEXTS) {
      const value = victim[key];

      if (typeof value === "string" && value.trim().length > 0) {
        texts.push({
          id: `victims.${index}.${key}`,
          label: `Пострадавший ${index + 1}: ${label}`,
          value,
          style,
        });
      }
    }
  });

  return texts;
};
