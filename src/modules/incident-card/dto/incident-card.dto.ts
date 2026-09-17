import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { DISPATCH_SERVICES, INCIDENT_CATEGORIES } from "@/drizzle/schema";
import { ClassifierRoutingSchema } from "@/modules/classifier/dto/classifier.dto";

const MAX_VICTIMS = 20;
const MAX_TEXT = 500;
const MAX_NOTES = 2_000;

/** Пустое поле в карточке — это «оператор не заполнил», а не пустая строка. */
const nullableText = (max = MAX_TEXT) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable();

const count = z.number().int().min(0).max(9_999).nullable();

export const IncidentCardVictimSchema = z
  .object({
    lastName: nullableText(120),
    firstName: nullableText(120),
    middleName: nullableText(120),
    /** «Повод вызова» из макета. */
    reason: nullableText(200),
    birthDate: nullableText(20),
    notes: nullableText(MAX_NOTES),
  })
  // Оператор может знать про пострадавшего одно имя и ничего больше.
  .partial()
  .strict();

/**
 * Карточка приходит целиком, но заполненной частично: `partial` делает
 * необязательным каждое поле, потому что оператор пишет её по ходу разговора,
 * а не одним движением.
 */
export const SaveIncidentCardSchema = z
  .object({
    callerAnonymous: z.boolean(),
    callerLastName: nullableText(120),
    callerFirstName: nullableText(120),
    callerMiddleName: nullableText(120),
    callerLanguage: nullableText(64),
    callerPhone: nullableText(32),

    addressText: nullableText(MAX_NOTES),
    district: nullableText(200),
    objectType: nullableText(200),
    entrance: nullableText(32),
    floor: nullableText(32),
    intercom: nullableText(32),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    nearby: z.boolean(),
    placeNotes: nullableText(MAX_NOTES),

    classifierEntryId: z.string().uuid().nullable(),
    classifierQualifierCodes: z.array(z.string().min(3).max(64)).max(32),
    incidentType: nullableText(200),
    categories: z.array(z.enum(INCIDENT_CATEGORIES)).max(4),
    startedAt: z.iso.datetime().nullable(),
    victimsTotal: count,
    victimsChildren: count,
    deathsTotal: count,
    deathsChildren: count,
    description: nullableText(MAX_NOTES),

    services: z.array(z.enum(DISPATCH_SERVICES)).max(13),
    /** Список целиком: порядок в нём и есть порядок в окне. */
    victims: z.array(IncidentCardVictimSchema).max(MAX_VICTIMS),
  })
  .partial()
  .strict();

export const IncidentCardSchema = SaveIncidentCardSchema.required({
  callerAnonymous: true,
  nearby: true,
  categories: true,
  classifierEntryId: true,
  classifierQualifierCodes: true,
  services: true,
  victims: true,
}).extend({
  trainingSessionId: z.string().min(1),
  /** Deterministic result produced by the backend, never accepted from input. */
  classifierRouting: ClassifierRoutingSchema.nullable(),
  /** Заполнено — карточка закрыта вместе со звонком и только читается. */
  submittedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});

export class SaveIncidentCardDto extends createZodDto(SaveIncidentCardSchema) {}
export class IncidentCardDto extends createZodDto(IncidentCardSchema) {}

export type IncidentCardVictim = z.infer<typeof IncidentCardVictimSchema>;
export type SaveIncidentCard = z.infer<typeof SaveIncidentCardSchema>;
export type IncidentCard = z.infer<typeof IncidentCardSchema>;
