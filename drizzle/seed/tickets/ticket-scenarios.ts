import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import {
  CALLER_GENDERS,
  DISPATCH_SERVICES,
  EMERGENCY_SERVICES,
  SCENARIO_CATEGORIES,
  TERRAIN_TYPES,
  type ScenarioCategory,
  type TerrainType,
} from "@/drizzle/schema";

/**
 * Вызовы из экзаменационных билетов АГС ГСИ как сценарии тренажёра.
 *
 * Билет задаёт только суть вызова: что случилось, кто звонит, адрес и
 * уточнение адреса. Всё остальное — голос, раскрытие фактов, эскалация —
 * строится здесь по одним правилам, чтобы 94 вызова не расходились в
 * мелочах. Результат проходит ту же ScenarioSeedSchema, что и сценарии,
 * написанные вручную: у билета нет отдельной, более слабой двери в базу.
 *
 * Из каждого опубликованного сценария строится и карточка ДДС, поэтому
 * билеты одновременно наполняют голосовой тренажёр и карточные занятия.
 */
// Путь от корня проекта, как у остальных сидов: сборка идёт в CommonJS.
export const TICKETS_FILE = join(
  process.cwd(),
  "drizzle",
  "seed",
  "tickets",
  "tickets.json",
);

const TicketSchema = z
  .object({
    code: z.string().regex(/^T\d{2}-\d$/),
    title: z.string().trim().min(3).max(120),
    situation: z.string().trim().min(10).max(400),
    /** Первая реплика, если заголовок в ней звучит неестественно. */
    opening: z.string().trim().min(3).max(300).optional(),
    category: z.enum(SCENARIO_CATEGORIES),
    difficulty: z.number().int().min(1).max(5),
    services: z.array(z.enum(EMERGENCY_SERVICES)).max(4),
    /** Полный набор служб ДДС: словарь сценария знает только 01–04. */
    dispatch: z.array(z.enum(DISPATCH_SERVICES)),
    caller: z
      .object({
        name: z.string().trim().min(2),
        gender: z.enum(CALLER_GENDERS),
        age: z.number().int().min(10).max(100),
        phone: z.string().trim().min(5),
      })
      .strict(),
    address: z
      .object({
        spoken: z.string().trim().min(5),
        clarified: z.string().trim().min(3).optional(),
        parts: z.record(z.string(), z.string().trim().min(1)),
      })
      .strict(),
    terrain: z.enum(TERRAIN_TYPES),
    point: z.tuple([z.number(), z.number()]),
    /** `null` — заявитель не знает, есть ли пострадавшие. */
    victims: z.number().int().min(0).nullable(),
    details: z.array(z.string().trim().min(2)),
  })
  .strict();

const TicketsFileSchema = z
  .object({
    source: z.string(),
    note: z.string(),
    excluded: z.array(z.object({ code: z.string(), reason: z.string() })),
    tickets: z.array(TicketSchema).min(1),
  })
  .strict();

export type Ticket = z.infer<typeof TicketSchema>;

const VOICES = {
  male: ["aiden", "dylan", "eric", "ryan"],
  female: ["serena", "vivian", "sohee", "ono_anna"],
} as const;

/** Радиус локатора: в поле и в лесу базовая станция накрывает километры. */
const LOCATOR_RADIUS: Record<TerrainType, number> = {
  city_dense: 300,
  city_block: 500,
  indoor: 300,
  highway: 1_500,
  open_field: 2_500,
  forest: 3_000,
};

const CATEGORY_LABEL: Record<ScenarioCategory, string> = {
  fire: "Пожар",
  road_accident: "ДТП",
  medical: "Медицинская помощь",
  criminal: "Правонарушение",
  gas_leak: "Запах газа",
  other: "Прочее",
};

const SERVICE_LABEL: Record<string, string> = {
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

const hash = (value: string): number =>
  [...value].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);

/** Корни слов для засчитывания факта: окончания в речи всё равно другие. */
const stems = (text: string, limit: number): string[] =>
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

/**
 * Части адреса с подписями: карточка ДДС склеивает их через запятую, и без
 * подписей «корпус 6, 9, 45» не прочитать. Эталон сравнивает голые номера.
 */
const labelledAddress = (
  parts: Readonly<Record<string, string>>,
): Record<string, string> => {
  const label: Record<string, (value: string) => string> = {
    building: (value) => (/^\d+$/u.test(value) ? `строение ${value}` : value),
    entrance: (value) => `подъезд ${value}`,
    floor: (value) => `этаж ${value}`,
    apartment: (value) => `кв. ${value}`,
  };
  return Object.fromEntries(
    Object.entries(parts).map(([key, value]) => [
      key,
      label[key]?.(value) ?? value,
    ]),
  );
};

const houseNumber = (house: string): string =>
  house.replace(/^(вл\.|владение)\s*/iu, "");

const victimsLine = (victims: number | null): string =>
  victims === null
    ? "Не знаю, есть ли пострадавшие, отсюда не видно."
    : victims === 0
      ? "Пострадавших нет."
      : `Пострадавших: ${victims}.`;

export function ticketToScenario(ticket: Ticket): unknown {
  const { caller, address } = ticket;
  const panic = ticket.difficulty >= 4 ? 3 : ticket.difficulty === 3 ? 2 : 1;
  const voices = VOICES[caller.gender];
  const radius = LOCATOR_RADIUS[ticket.terrain];
  // Центр локатора смещён от точки на 40 % радиуса: вызов попадает в
  // зону, но точку оператору всё равно нужно найти по адресу.
  const shift = (radius * 0.4) / 111_000;
  const anonymous = caller.name === "Не назвался";

  const facts = [
    {
      key: "incident_type",
      promptValue: ticket.situation,
      displayLabel: "Что случилось",
      severity: ticket.victims ? "heavy" : "normal",
      cardField: "category",
      cardValue: ticket.title,
      contentKeywords: stems(ticket.title, 4),
      disclosure: { type: "immediate" },
      priority: 9,
    },
    {
      key: "address",
      promptValue: address.spoken,
      displayLabel: "Адрес",
      severity: "normal",
      cardField: "street",
      cardValue: address.parts.street ?? address.parts.object ?? address.spoken,
      contentKeywords: stems(address.parts.street ?? address.spoken, 3),
      disclosure: {
        type: "on_question",
        keywords: ["адрес", "улиц", "где", "куда", "дом", "место", "находит"],
      },
      priority: 9,
    },
    ...(address.clarified
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
      promptValue: victimsLine(ticket.victims),
      displayLabel: "Пострадавшие",
      severity: ticket.victims ? "heavy" : "normal",
      cardField: "victims_total",
      cardValue: ticket.victims === null ? null : String(ticket.victims),
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
    ...ticket.details.map((detail, index) => ({
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
    ...(address.parts.street
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
    ...(address.parts.house
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
    ...(address.parts.apartment
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
      expectedValue: CATEGORY_LABEL[ticket.category],
      acceptableValues: [ticket.title],
      comparison: "contains",
      isRequired: true,
      sourceFactKey: "incident_type",
    },
    ...(ticket.victims === null
      ? []
      : [
          {
            field: "victims_total",
            expectedValue: String(ticket.victims),
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
    {
      field: "caller_phone",
      expectedValue: caller.phone,
      comparison: "normalized",
      isRequired: false,
      sourceFactKey: null,
    },
  ];

  const dispatchNote =
    ticket.dispatch.length > 0
      ? `Службы: ${ticket.dispatch.map((code) => SERVICE_LABEL[code]).join(", ")}.`
      : "Экстренного повода нет, службы не направляются.";

  return {
    code: ticket.code,
    title: ticket.title,
    category: ticket.category,
    difficulty: ticket.difficulty,
    summary: ticket.situation,
    persona: {
      code: `ticket-${ticket.code.toLowerCase()}`,
      displayName: `${caller.name}, ${caller.age} лет`.slice(0, 120),
      gender: caller.gender,
      ageYears: caller.age,
      condition:
        panic >= 3
          ? "Напуган, торопит, отвечает сбивчиво"
          : "Взволнован, но отвечает на вопросы",
      speechStyle:
        "Говорит от первого лица: сначала главное, остальное — только на вопросы. Адрес называет так, как привык, уточнение даёт, если переспросят. Длинных объяснений не любит.",
      voiceId: voices[hash(ticket.code) % voices.length],
      baselinePanicLevel: panic,
      baseSpeechRate: panic >= 3 ? 1.08 : 1,
    },
    version: {
      panicFloor: 0,
      panicCeiling: 4,
      maxInterruptions: ticket.difficulty >= 4 ? 4 : 2,
      initiativeCooldownSeconds: 12,
      answerNormSeconds: 240,
      expectedDurationSeconds: 180 + ticket.difficulty * 45,
      passThreshold: 75,
      expectedServices: ticket.services,
      referenceNotes: [
        dispatchNote,
        address.clarified ? `Уточнение адреса: ${address.clarified}.` : null,
        ...ticket.details,
      ]
        .filter(Boolean)
        .join(" "),
      openingLine:
        ticket.opening ??
        `${panic >= 3 ? "Алло, помогите!" : "Алло!"} ${ticket.title}!`,
      fallbackLine: "Что? Плохо слышно, повторите, пожалуйста.",
    },
    location: {
      terrain: ticket.terrain,
      exactAddress: labelledAddress(address.parts),
      exactPoint: ticket.point,
      locatorCenter: [ticket.point[0] + shift, ticket.point[1]],
      locatorRadiusMeters: radius,
      locatorLabel: `Мобильный · базовая станция рядом с местом вызова (${address.parts.city ?? "Московский регион"})`,
      locatorAccuracy:
        ticket.terrain === "forest" || ticket.terrain === "open_field"
          ? "approximate"
          : "identified",
      callerNumber: caller.phone,
      previouslyCalled: false,
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
      {
        text: "Точный адрес происшествия",
        satisfiedByFactKeys: ["address"],
        isCritical: true,
      },
      ...(address.clarified
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
      notes: `Билет ${ticket.code}. ${dispatchNote}`,
    },
  };
}

export function loadTickets(file: string = TICKETS_FILE): Ticket[] {
  return TicketsFileSchema.parse(JSON.parse(readFileSync(file, "utf8")))
    .tickets;
}
