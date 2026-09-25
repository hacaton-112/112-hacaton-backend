import type {
  CALLER_GENDERS,
  DispatchService,
  EmergencyService,
  ScenarioCategory,
} from "@/drizzle/schema";

type CallerGender = (typeof CALLER_GENDERS)[number];

/**
 * Вводная происшествия — всё, что по сути отличает один вызов от другого.
 *
 * Её пишет человек (строка экзаменационного билета) или модель (черновик
 * помощника). Голос, раскрытие фактов, эскалация и эталон карточки
 * строятся из неё здесь по одним правилам: вводная короткая, поэтому модель
 * отвечает за секунды и не ошибается в перекрёстных ссылках полного
 * сценария, которые ей приходилось бы держать в голове.
 */
export interface IncidentBrief {
  readonly code: string;
  readonly title: string;
  readonly situation: string;
  /** Первая реплика, если заголовок в ней звучит неестественно. */
  readonly opening?: string;
  readonly category: ScenarioCategory;
  readonly difficulty: number;
  readonly services: readonly EmergencyService[];
  /** Полный набор служб ДДС: словарь сценария знает только 01–04. */
  readonly dispatch?: readonly DispatchService[];
  readonly caller: {
    readonly name: string;
    readonly gender: CallerGender;
    readonly age: number;
    readonly phone?: string;
  };
  /** Без адреса место задаёт преподаватель на карте конструктора. */
  readonly address?: {
    readonly spoken: string;
    readonly clarified?: string;
    readonly parts: Readonly<Record<string, string>>;
  };
  /** `null` — заявитель не знает, есть ли пострадавшие. */
  readonly victims: number | null;
  readonly details: readonly string[];
  /** Код персонажа, если у источника он свой (билеты публиковались с ним). */
  readonly personaCode?: string;
  /** Подпись источника в заметке эталона, например «Билет T01-1». */
  readonly referenceLabel?: string;
}

const VOICES = {
  male: ["aiden", "dylan", "eric", "ryan"],
  female: ["serena", "vivian", "sohee", "ono_anna"],
} as const;

const CATEGORY_LABEL: Record<ScenarioCategory, string> = {
  fire: "Пожар",
  road_accident: "ДТП",
  medical: "Медицинская помощь",
  criminal: "Правонарушение",
  gas_leak: "Запах газа",
  other: "Прочее",
};

const SERVICE_LABEL: Record<DispatchService, string> = {
  dds_01: "пожарная охрана (01)",
  dds_02: "полиция (02)",
  dds_03: "скорая помощь (03)",
  dds_04: "газовая служба (04)",
  zhkh: "ЖКХ",
  antiterror: "антитеррор",
  eddc: "ЕДДС",
  uadit: "УАДИТ",
  rosgvardia: "Росгвардия",
  cuks: "ЦУКС",
  ass: "аварийно-спасательная служба",
  lpc: "лесопожарный центр",
  ss: "социальная служба",
};

const SERVICE_CODE: Record<EmergencyService, DispatchService> = {
  fire: "dds_01",
  police: "dds_02",
  ambulance: "dds_03",
  gas: "dds_04",
};

export const ANONYMOUS_CALLER = "Не назвался";

const hash = (value: string): number =>
  [...value].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);

/** Корни слов для засчитывания факта: окончания в речи всё равно другие. */
export const stems = (text: string, limit: number): string[] =>
  [
    ...new Set(
      text
        .toLocaleLowerCase("ru-RU")
        .replace(/ё/g, "е")
        .split(/[^а-яa-z0-9]+/u)
        .filter((word) => word.length >= 5)
        .map((word) => word.slice(0, 6)),
    ),
  ].slice(0, limit);

const houseNumber = (house: string): string =>
  house.replace(/^(вл\.|владение)\s*/iu, "");

const victimsLine = (victims: number | null): string =>
  victims === null
    ? "Не знаю, есть ли пострадавшие, отсюда не видно."
    : victims === 0
      ? "Пострадавших нет."
      : `Пострадавших: ${victims}.`;

/** Службы ДДС из вводной: явный полный набор или те же 01–04. */
export const incidentDispatch = (brief: IncidentBrief): DispatchService[] => [
  ...(brief.dispatch ?? brief.services.map((service) => SERVICE_CODE[service])),
];

/**
 * Сценарий без места происшествия.
 *
 * Место — отдельная часть: у билета оно известно, а в черновике помощника
 * его задаёт преподаватель на карте, и модели адреса не придумывают.
 */
export function buildIncidentScenario(brief: IncidentBrief) {
  const { caller, address } = brief;
  const panic = brief.difficulty >= 4 ? 3 : brief.difficulty === 3 ? 2 : 1;
  const voices = VOICES[caller.gender];
  const anonymous = caller.name === ANONYMOUS_CALLER;
  const dispatch = incidentDispatch(brief);
  const dispatchNote =
    dispatch.length > 0
      ? `Службы: ${dispatch.map((code) => SERVICE_LABEL[code]).join(", ")}.`
      : "Экстренного повода нет, службы не направляются.";

  const facts = [
    {
      key: "incident_type",
      promptValue: brief.situation,
      displayLabel: "Что случилось",
      severity: brief.victims ? "heavy" : "normal",
      cardField: "category",
      cardValue: brief.title,
      contentKeywords: stems(brief.title, 4),
      disclosure: { type: "immediate" },
      priority: 9,
    },
    ...(address
      ? [
          {
            key: "address",
            promptValue: address.spoken,
            displayLabel: "Адрес",
            severity: "normal",
            cardField: "street",
            cardValue:
              address.parts.street ?? address.parts.object ?? address.spoken,
            contentKeywords: stems(address.parts.street ?? address.spoken, 3),
            disclosure: {
              type: "on_question",
              keywords: [
                "адрес",
                "улиц",
                "где",
                "куда",
                "дом",
                "место",
                "находит",
              ],
            },
            priority: 9,
          },
        ]
      : []),
    ...(address?.clarified
      ? [
          {
            key: "address_clarified",
            promptValue: address.clarified,
            displayLabel: "Уточнение адреса",
            severity: "normal",
            cardField: "landmarks",
            cardValue: address.clarified,
            contentKeywords: stems(address.clarified, 3),
            disclosure: {
              type: "on_question",
              keywords: [
                "уточн",
                "точнее",
                "точный",
                "номер дома",
                "какой дом",
                "ориентир",
                "рядом",
              ],
            },
            priority: 8,
          },
        ]
      : []),
    {
      key: "victims",
      promptValue: victimsLine(brief.victims),
      displayLabel: "Пострадавшие",
      severity: brief.victims ? "heavy" : "normal",
      cardField: "victims_total",
      cardValue: brief.victims === null ? null : String(brief.victims),
      contentKeywords: ["пострадав", "ранен", "люди"],
      disclosure: {
        type: "on_question",
        keywords: [
          "пострадав",
          "ранен",
          "люди",
          "живы",
          "сколько",
          "дышит",
          "сознани",
        ],
      },
      priority: 8,
    },
    {
      key: "caller_name",
      promptValue: anonymous
        ? "Не буду я представляться."
        : `Меня зовут ${caller.name}.`,
      displayLabel: "Заявитель",
      severity: "normal",
      cardField: "caller_name",
      cardValue: anonymous ? null : caller.name,
      contentKeywords: anonymous ? [] : stems(caller.name, 2),
      disclosure: {
        type: "on_question",
        keywords: ["зовут", "фамили", "имя", "представ", "кто звонит"],
      },
      priority: 5,
    },
    ...brief.details.map((detail, index) => ({
      key: `detail_${index + 1}`,
      promptValue: detail,
      displayLabel: "Подробности",
      severity: "normal",
      cardField: index === 0 ? "dispatcher_notes" : null,
      cardValue: index === 0 ? detail : null,
      contentKeywords: stems(detail, 3),
      disclosure: {
        type: "on_question",
        keywords: [
          "подробн",
          "ещё",
          "еще",
          "приметы",
          "номер",
          "опишите",
          "видите",
          "что там",
        ],
      },
      priority: 5,
    })),
  ];

  const referenceFields = [
    ...(address?.parts.street
      ? [
          {
            field: "street",
            expectedValue: address.parts.street,
            comparison: "contains",
            isRequired: true,
            sourceFactKey: "address",
          },
        ]
      : []),
    ...(address?.parts.house
      ? [
          {
            field: "house",
            expectedValue: houseNumber(address.parts.house),
            comparison: "contains",
            isRequired: true,
            sourceFactKey: address.clarified ? "address_clarified" : "address",
          },
        ]
      : []),
    ...(address?.parts.apartment
      ? [
          {
            field: "apartment",
            expectedValue: address.parts.apartment,
            comparison: "contains",
            isRequired: true,
            sourceFactKey: "address",
          },
        ]
      : []),
    {
      field: "category",
      expectedValue: CATEGORY_LABEL[brief.category],
      acceptableValues: [brief.title],
      comparison: "contains",
      isRequired: true,
      sourceFactKey: "incident_type",
    },
    ...(brief.victims === null
      ? []
      : [
          {
            field: "victims_total",
            expectedValue: String(brief.victims),
            comparison: "numeric_range",
            isRequired: true,
            sourceFactKey: "victims",
          },
        ]),
    ...(anonymous
      ? []
      : [
          {
            // Полное имя — его показывает карточка ДДС; фамилии оператору
            // достаточно, поэтому она принимается как вариант.
            field: "caller_name",
            expectedValue: caller.name,
            acceptableValues: [caller.name.split(/[ ,]/u)[0]],
            comparison: "contains",
            isRequired: false,
            sourceFactKey: "caller_name",
          },
        ]),
    ...(caller.phone
      ? [
          {
            field: "caller_phone",
            expectedValue: caller.phone,
            comparison: "normalized",
            isRequired: false,
            sourceFactKey: null,
          },
        ]
      : []),
  ];

  return {
    code: brief.code,
    title: brief.title,
    category: brief.category,
    difficulty: brief.difficulty,
    summary: brief.situation,
    persona: {
      code: brief.personaCode ?? `${brief.code.toLowerCase()}-caller`,
      displayName: `${caller.name}, ${caller.age} лет`.slice(0, 120),
      gender: caller.gender,
      ageYears: caller.age,
      condition:
        panic >= 3
          ? "Напуган, торопит, отвечает сбивчиво"
          : "Взволнован, но отвечает на вопросы",
      speechStyle:
        "Говорит от первого лица: сначала главное, остальное — только на вопросы. Адрес называет так, как привык, уточнение даёт, если переспросят. Длинных объяснений не любит.",
      voiceId: voices[hash(brief.code) % voices.length],
      baselinePanicLevel: panic,
      baseSpeechRate: panic >= 3 ? 1.08 : 1,
    },
    version: {
      panicFloor: 0,
      panicCeiling: 4,
      maxInterruptions: brief.difficulty >= 4 ? 4 : 2,
      initiativeCooldownSeconds: 12,
      answerNormSeconds: 240,
      expectedDurationSeconds: 180 + brief.difficulty * 45,
      passThreshold: 75,
      expectedServices: [...brief.services],
      referenceNotes: [
        dispatchNote,
        address?.clarified ? `Уточнение адреса: ${address.clarified}.` : null,
        ...brief.details,
      ]
        .filter(Boolean)
        .join(" "),
      openingLine:
        brief.opening ??
        `${panic >= 3 ? "Алло, помогите!" : "Алло!"} ${brief.title}!`,
      fallbackLine: "Что? Плохо слышно, повторите, пожалуйста.",
    },
    escalation: [
      {
        trigger: "operator_silence",
        direction: "up",
        cooldownSeconds: 10,
        params: { seconds: 7 },
      },
      { trigger: "heavy_fact_revealed", direction: "up", cooldownSeconds: 0 },
      {
        trigger: "question_repeated",
        direction: "up",
        cooldownSeconds: 15,
        params: { times: 2 },
      },
      {
        trigger: "forbidden_phrase",
        direction: "up",
        cooldownSeconds: 0,
        params: { keywords: ["успокойтесь", "не кричите", "подождите"] },
      },
      {
        trigger: "calming_phrase",
        direction: "down",
        cooldownSeconds: 0,
        params: {
          keywords: ["помощь уже едет", "бригада выехала", "я вас слышу"],
        },
      },
      { trigger: "services_confirmed", direction: "down", cooldownSeconds: 0 },
      {
        trigger: "instruction_followed",
        direction: "down",
        cooldownSeconds: 0,
      },
    ],
    facts,
    mandatoryQuestions: [
      ...(address
        ? [
            {
              text: "Точный адрес происшествия",
              satisfiedByFactKeys: ["address"],
              isCritical: true,
            },
          ]
        : []),
      ...(address?.clarified
        ? [
            {
              text: "Уточнение адреса или ориентир",
              satisfiedByFactKeys: ["address_clarified"],
              isCritical: true,
            },
          ]
        : []),
      {
        text: "Есть ли пострадавшие и сколько",
        satisfiedByFactKeys: ["victims"],
        isCritical: true,
      },
      {
        text: "Как зовут заявителя",
        satisfiedByFactKeys: ["caller_name"],
        isCritical: false,
      },
    ],
    referenceCard: {
      fields: referenceFields,
      notes: brief.referenceLabel
        ? `${brief.referenceLabel}. ${dispatchNote}`
        : dispatchNote,
    },
  };
}
