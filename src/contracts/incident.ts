import { z } from "zod";

import { ClassifierRoutingSchema } from "./classifier";

/**
 * Службы так, как они подписаны на кнопках АРМ. Коды совпадают с backend:
 * называть ДДС-01 «пожарной» внутри карточки значит заставить оператора и
 * разбор занятия говорить на разных языках.
 */
export const DISPATCH_SERVICES = [
  "dds_01",
  "dds_02",
  "dds_03",
  "dds_04",
  "zhkh",
  "antiterror",
  "eddc",
  "uadit",
  "rosgvardia",
  "cuks",
  "ass",
  "lpc",
  "ss",
] as const;

export const INCIDENT_CATEGORIES = [
  "socially_significant",
  "threat_to_people",
  "emergency_threat",
  "important",
] as const;

/** Языки, которые оператор может зафиксировать со слов заявителя. */
export const CALLER_LANGUAGE_OPTIONS = [
  "Русский",
  "Азербайджанский",
  "Армянский",
  "Белорусский",
  "Грузинский",
  "Казахский",
  "Киргизский",
  "Таджикский",
  "Туркменский",
  "Узбекский",
  "Украинский",
  "Английский",
  "Арабский",
  "Китайский",
  "Корейский",
  "Турецкий",
  "Немецкий",
  "Французский",
  "Испанский",
  "Другой",
] as const;

export const DispatchServiceSchema = z.enum(DISPATCH_SERVICES);
export const IncidentCategorySchema = z.enum(INCIDENT_CATEGORIES);

/** Пустое поле — «оператор не заполнил», а не пустая строка. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable();

/**
 * В DOM число приходит строкой, а пустое поле — пустой строкой; backend же
 * присылает незаполненный счётчик как `null`. Одна схема читает и то и другое:
 * иначе разбор звонка не открывается, пока оператор не заполнил все счётчики.
 */
const count = z
  .union([z.string(), z.number(), z.null()])
  .transform((value) => (value === "" || value === null ? null : Number(value)))
  .pipe(z.number().int().min(0).max(9_999).nullable());

const coordinate = (limit: number) =>
  z
    .union([z.string(), z.number(), z.null()])
    .transform((value) =>
      value === "" || value === null ? null : Number(value),
    )
    .pipe(z.number().min(-limit).max(limit).nullable());

export const IncidentCardVictimSchema = z
  .object({
    lastName: text(120),
    firstName: text(120),
    middleName: text(120),
    reason: text(200),
    birthDate: text(20),
    notes: text(2_000),
  })
  .partial()
  .strict();

/**
 * Карточка происшествия — то же, что хранит backend.
 *
 * Адрес одной строкой, как его просит настоящее АРМ: улица, дом, корпус,
 * строение, владение, дорога, километр, метр, участок и объект в одном поле.
 * Разбирать её на части будет эталонная анкета сценария.
 */
export const IncidentCardSchema = z.object({
  callerAnonymous: z.boolean(),
  callerLastName: text(120),
  callerFirstName: text(120),
  callerMiddleName: text(120),
  callerLanguage: text(64),
  callerPhone: text(32),

  addressText: text(2_000),
  district: text(200),
  objectType: text(200),
  entrance: text(32),
  floor: text(32),
  intercom: text(32),
  latitude: coordinate(90),
  longitude: coordinate(180),
  nearby: z.boolean(),
  placeNotes: text(2_000),

  classifierEntryId: z.string().uuid().nullable().default(null),
  classifierQualifierCodes: z
    .array(z.string().min(3).max(64))
    .max(32)
    .default([]),
  classifierRouting: ClassifierRoutingSchema.nullable().default(null),
  incidentType: text(200),
  categories: z.array(IncidentCategorySchema).max(4),
  startedAt: z.iso.datetime().nullable(),
  victimsTotal: count,
  victimsChildren: count,
  deathsTotal: count,
  deathsChildren: count,
  description: text(2_000),

  services: z.array(DispatchServiceSchema).max(DISPATCH_SERVICES.length),
  victims: z.array(IncidentCardVictimSchema).max(20),
  submittedAt: z.iso.datetime().nullable().default(null),
});

export const IncidentCardDispatchReceiptSchema = z.object({
  trainingSessionId: z.string().min(1),
  eventId: z.uuid(),
  dispatchedAt: z.iso.datetime(),
  deliveries: z.array(
    z.object({
      id: z.uuid(),
      addressedService: DispatchServiceSchema,
      acknowledgementDeadlineAt: z.iso.datetime(),
    }),
  ),
});

export type DispatchService = z.infer<typeof DispatchServiceSchema>;
export type IncidentCategory = z.infer<typeof IncidentCategorySchema>;
export type IncidentCardVictim = z.infer<typeof IncidentCardVictimSchema>;
export type IncidentCard = z.infer<typeof IncidentCardSchema>;
export type IncidentCardDispatchReceipt = z.infer<
  typeof IncidentCardDispatchReceiptSchema
>;
/** Значения полей до валидации: в DOM всё приходит строками. */
export type IncidentCardInput = z.input<typeof IncidentCardSchema>;
export type IncidentCardPatch = Partial<IncidentCardInput>;

export const EMPTY_INCIDENT_CARD: IncidentCardInput = {
  callerAnonymous: false,
  callerLastName: "",
  callerFirstName: "",
  callerMiddleName: "",
  callerLanguage: "",
  callerPhone: "",
  addressText: "",
  district: "",
  objectType: "",
  entrance: "",
  floor: "",
  intercom: "",
  latitude: "",
  longitude: "",
  nearby: false,
  placeNotes: "",
  classifierEntryId: null,
  classifierQualifierCodes: [],
  classifierRouting: null,
  incidentType: "",
  categories: [],
  startedAt: null,
  victimsTotal: "",
  victimsChildren: "",
  deathsTotal: "",
  deathsChildren: "",
  description: "",
  services: [],
  victims: [],
  submittedAt: null,
};

export const INCIDENT_CATEGORY_LABELS: Record<IncidentCategory, string> = {
  socially_significant: "Социально-значимое",
  threat_to_people: "Угроза людям",
  emergency_threat: "Угроза ЧС",
  important: "Важно",
};

export const DISPATCH_SERVICE_LABELS: Record<DispatchService, string> = {
  dds_01: "ДДС-01",
  dds_02: "ДДС-02",
  dds_03: "ДДС-03",
  dds_04: "ДДС-04",
  zhkh: "ЖКХ",
  antiterror: "Антитеррор",
  eddc: "ЕДДС",
  uadit: "УАДиТ",
  rosgvardia: "Росгвардия",
  cuks: "ЦУКС",
  ass: "АСС",
  lpc: "ЛПЦ",
  ss: "СС",
};

/** Подсказки для поля «Тип происшествия»; хранится оно свободным текстом. */
export const INCIDENT_TYPE_OPTIONS = [
  "Пожар, задымление",
  "ДТП",
  "Медицинский случай",
  "Правонарушение",
  "Авария ЖКХ",
  "Иное",
] as const;
